// Vote Service with Anti-Abuse + Votifier Integration
// Features: IP tracking, proxy/VPN detection, rate limiting, fingerprinting, Votifier RSA voting

import { createClient } from 'npm:@supabase/supabase-js@2';

interface VoteRequest {
  serverId: string;
  username: string;
  address?: string;
  fingerprint?: string; // Browser fingerprint for additional tracking
}

interface IPCheckResult {
  isProxy: boolean;
  isVPN: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  threatScore: number; // 0-100
  country: string;
  isp: string;
  fraudScore: number; // 0-100
}

// IP Quality Check using IPHub (free tier available) or IPQualityScore
async function checkIPQuality(ip: string): Promise<IPCheckResult> {
  // Default: allow if no API key configured
  const defaultResult: IPCheckResult = {
    isProxy: false,
    isVPN: false,
    isTor: false,
    isDatacenter: false,
    threatScore: 0,
    country: 'Unknown',
    isp: 'Unknown',
    fraudScore: 0
  };
  
  try {
    // Try IPHub first (free 1000 requests/day)
    const iphubKey = Deno.env.get('IPHUB_API_KEY');
    if (iphubKey && ip !== '127.0.0.1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      const response = await fetch(`https://v2.api.iphub.info/ip/${ip}`, {
        headers: { 'X-Key': iphubKey }
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          isProxy: data.block === 1, // 1 = residential proxy/VPN, 2 = datacenter
          isVPN: data.block === 1,
          isTor: data.block === 1, // IPHub doesn't specifically detect Tor
          isDatacenter: data.block === 2,
          threatScore: data.block === 0 ? 0 : data.block === 1 ? 75 : 50,
          country: data.countryCode || 'Unknown',
          isp: data.isp || 'Unknown',
          fraudScore: data.block === 0 ? 0 : 50
        };
      }
    }
    
    // Fallback: IPQualityScore (free 5000 requests/month)
    const ipqsKey = Deno.env.get('IPQUALITYSCORE_API_KEY');
    if (ipqsKey && ip !== '127.0.0.1') {
      const response = await fetch(
        `https://www.ipqualityscore.com/api/json/ip/${ipqsKey}/${ip}?strictness=1&allow_public_access_points=false&fast=true`
      );
      
      if (response.ok) {
        const data = await response.json();
        return {
          isProxy: data.proxy || false,
          isVPN: data.vpn || false,
          isTor: data.tor || false,
          isDatacenter: data.datacenter || false,
          threatScore: data.fraud_score || 0,
          country: data.country_code || 'Unknown',
          isp: data.ISP || 'Unknown',
          fraudScore: data.fraud_score || 0
        };
      }
    }
    
    // If no API keys, do basic checks
    // Check for common datacenter ASN ranges
    const datacenterRanges = [
      '104.16.', '104.17.', '104.18.', '104.19.', // Cloudflare
      '172.64.', '172.65.', '172.66.', '172.67.', // Cloudflare
      '35.', '34.', // Google Cloud
      '13.', '52.', '54.', // AWS
      '20.', '40.', '51.', // Azure
      '138.197.', '165.227.', '64.227.', // DigitalOcean
      '198.199.', '162.243.', // DigitalOcean
    ];
    
    const isDatacenter = datacenterRanges.some(range => ip.startsWith(range));
    
    return {
      ...defaultResult,
      isDatacenter,
      threatScore: isDatacenter ? 30 : 0
    };
    
  } catch (err) {
    console.error('IP check failed:', err);
    return defaultResult;
  }
}

// Get client IP from request
function getClientIP(request: Request): string {
  // Check X-Forwarded-For (from proxy/CDN)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take the first IP if multiple (original client)
    return forwarded.split(',')[0].trim();
  }
  
  // Check X-Real-IP
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;
  
  // Check CF-Connecting-IP (Cloudflare)
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;
  
  // Fallback (in Deno/Supabase Functions, this won't be the real IP)
  return 'unknown';
}

interface VoteResponse {
  success: boolean;
  message: string;
  vote?: {
    id: string;
    timestamp: string;
  };
}

// Votifier RSA Encryption using Web Crypto API
// Implements Votifier 2 protocol for Minecraft server voting

interface VotifierPayload {
  serviceName: string;
  username: string;
  address: string;
  timestamp: number;
}

// RSA public key PEM to CryptoKey
async function importRSAPublicKey(pem: string): Promise<CryptoKey> {
  // Remove PEM headers and whitespace
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return await crypto.subtle.importKey(
    'spki',
    bytes,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

// Send Votifier vote to Minecraft server
async function sendVotifierVote(
  serverIp: string,
  serverPort: number,
  publicKeyPem: string,
  username: string,
  serviceName: string = 'GuildPost'
): Promise<boolean> {
  try {
    // Import the RSA public key
    const publicKey = await importRSAPublicKey(publicKeyPem);
    
    // Build Votifier 2 payload
    const payload: VotifierPayload = {
      serviceName,
      username: username.toLowerCase(),
      address: serverIp,
      timestamp: Date.now()
    };
    
    // Serialize payload to JSON
    const payloadJson = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadJson);
    
    // Encrypt payload using RSA-OAEP
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      payloadBytes
    );
    
    // Create Votifier 2 packet:
    // [2 bytes: block ID 0x733A] [2 bytes: version 0x0002] [4 bytes: payload length] [encrypted payload]
    const blockId = new Uint8Array([0x73, 0x3A]); // "s:"
    const version = new Uint8Array([0x00, 0x02]); // Version 2
    const lengthBytes = new Uint8Array(4);
    const view = new DataView(lengthBytes.buffer);
    view.setUint32(0, encrypted.byteLength, false); // Big-endian
    
    // Combine packet parts
    const encryptedBytes = new Uint8Array(encrypted);
    const packet = new Uint8Array(2 + 2 + 4 + encryptedBytes.length);
    packet.set(blockId, 0);
    packet.set(version, 2);
    packet.set(lengthBytes, 4);
    packet.set(encryptedBytes, 8);
    
    // Connect to server and send
    const connection = await Deno.connect({
      hostname: serverIp,
      port: serverPort
    });
    
    try {
      // Send the packet
      await connection.write(packet);
      
      // Wait for acknowledgment (optional, with timeout)
      const buffer = new Uint8Array(256);
      connection.setReadTimeout?.(5000); // 5 second timeout if available
      
      const bytesRead = await connection.read(buffer);
      if (bytesRead) {
        const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
        console.log('Votifier response:', response);
        return response.includes('OK') || response.includes('success');
      }
      
      return true; // Assume success if no error
    } finally {
      connection.close();
    }
  } catch (err) {
    console.error('Votifier send failed:', err);
    return false;
  }
}

export async function handleVote(request: Request): Promise<Response> {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }
  
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, message: 'Method not allowed' }),
      { headers, status: 405 }
    );
  }
  
  try {
    const { serverId, username, address, fingerprint }: VoteRequest = await request.json();
    
    if (!serverId || !username) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing serverId or username' }),
        { headers, status: 400 }
      );
    }
    
    // Get client IP
    const clientIP = getClientIP(request);
    
    // Check IP quality (proxy/VPN/Tor)
    const ipCheck = await checkIPQuality(clientIP);
    
    // Block high-risk IPs
    if (ipCheck.fraudScore > 80 || ipCheck.isTor) {
      console.warn(`Blocked vote from high-risk IP: ${clientIP}`, ipCheck);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Vote blocked due to suspicious network activity.'
        }),
        { headers, status: 403 }
      );
    }
    
    // Get Supabase credentials from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // ANTI-ABUSE CHECKS
    const cooldownHours = 24;
    const cooldownDate = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const ipCooldownHours = 12; // Stricter for IPs
    const ipCooldownDate = new Date(Date.now() - ipCooldownHours * 60 * 60 * 1000);
    
    // 1. Check username cooldown (24h per server)
    const { data: recentUserVotes, error: userCheckError } = await supabase
      .from('votes')
      .select('id, created_at')
      .eq('server_id', serverId)
      .eq('username', username.toLowerCase())
      .gte('created_at', cooldownDate.toISOString())
      .limit(1);
    
    if (userCheckError) throw userCheckError;
    
    if (recentUserVotes && recentUserVotes.length > 0) {
      const lastVote = new Date(recentUserVotes[0].created_at);
      const nextVote = new Date(lastVote.getTime() + cooldownHours * 60 * 60 * 1000);
      const hoursLeft = Math.ceil((nextVote.getTime() - Date.now()) / (60 * 60 * 1000));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `You already voted! Wait ${hoursLeft} more hour${hoursLeft !== 1 ? 's' : ''}.`
        }),
        { headers, status: 429 }
      );
    }
    
    // 2. Check IP cooldown (12h per server per IP)
    if (clientIP !== 'unknown') {
      const { data: recentIPVotes, error: ipCheckError } = await supabase
        .from('votes')
        .select('id, created_at, username')
        .eq('server_id', serverId)
        .eq('ip_address', clientIP)
        .gte('created_at', ipCooldownDate.toISOString())
        .limit(1);
      
      if (ipCheckError) throw ipCheckError;
      
      if (recentIPVotes && recentIPVotes.length > 0) {
        const lastVote = recentIPVotes[0];
        const hoursLeft = Math.ceil(ipCooldownHours - (Date.now() - new Date(lastVote.created_at).getTime()) / (60 * 60 * 1000));
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `This network already voted recently. Wait ${hoursLeft} more hour${hoursLeft !== 1 ? 's' : ''} or use a different connection.`
          }),
          { headers, status: 429 }
        );
      }
      
      // 3. Check for IP changing usernames (suspicious behavior)
      const { data: ipUserCount, error: ipUserError } = await supabase
        .from('votes')
        .select('username', { count: 'exact', head: true })
        .eq('ip_address', clientIP)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days
      
      if (!ipUserError && (ipUserCount as any)?.count > 10) {
        console.warn(`Suspicious activity: IP ${clientIP} voted for ${(ipUserCount as any).count} different usernames this week`);
        // Still allow but log for review
      }
    }
    
    // 4. Check fingerprint cooldown (if provided)
    if (fingerprint) {
      const { data: fingerprintVotes, error: fpError } = await supabase
        .from('votes')
        .select('id')
        .eq('server_id', serverId)
        .eq('fingerprint', fingerprint)
        .gte('created_at', cooldownDate.toISOString())
        .limit(1);
      
      if (!fpError && fingerprintVotes && fingerprintVotes.length > 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'You already voted from this device! Wait 24 hours.'
          }),
          { headers, status: 429 }
        );
      }
    }
    
    // Get server details
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id, name, ip, port, votifier_key, vote_count, discord_webhook')
      .eq('id', serverId)
      .single();
    
    if (serverError || !server) {
      return new Response(
        JSON.stringify({ success: false, message: 'Server not found' }),
        { headers, status: 404 }
      );
    }
    
    // Record the vote with full tracking
    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .insert([{
        server_id: serverId,
        username: username.toLowerCase(),
        ip_address: clientIP,
        fingerprint: fingerprint || null,
        country: ipCheck.country,
        isp: ipCheck.isp,
        is_proxy: ipCheck.isProxy,
        is_vpn: ipCheck.isVPN,
        is_tor: ipCheck.isTor,
        fraud_score: ipCheck.fraudScore,
        user_agent: request.headers.get('user-agent'),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (voteError) {
      throw voteError;
    }
    
    // Increment vote count
    const { error: updateError } = await supabase
      .from('servers')
      .update({ vote_count: (server.vote_count || 0) + 1 })
      .eq('id', serverId);
    
    if (updateError) {
      console.error('Failed to update vote count:', updateError);
    }
    
    // Send Discord webhook notification (if configured)
    if (server.discord_webhook) {
      try {
        await fetch(server.discord_webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `✅ New Vote for ${server.name}`,
              description: `**${username}** just voted on GuildPost!`,
              color: 0x00f5d4,
              timestamp: new Date().toISOString(),
              footer: {
                text: `Total votes: ${(server.vote_count || 0) + 1}`
              }
            }]
          })
        });
      } catch (err) {
        console.error('Discord webhook failed:', err);
      }
    }
    
    // Send Votifier vote if server has votifier configured
    let votifierSent = false;
    if (server.votifier_key && server.ip) {
      // Extract port from server.ip if it includes port, otherwise use default 8192
      let votifierPort = 8192;
      let serverAddress = server.ip;
      if (server.ip.includes(':')) {
        const [addr, portStr] = server.ip.split(':');
        serverAddress = addr;
        votifierPort = parseInt(portStr, 10) || 8192;
      }
      
      votifierSent = await sendVotifierVote(
        serverAddress,
        votifierPort,
        server.votifier_key,
        username,
        'GuildPost'
      );
      
      if (votifierSent) {
        console.log(`Votifier vote sent to ${server.name} for ${username}`);
      } else {
        console.warn(`Votifier vote failed for ${server.name}`);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Vote recorded successfully!',
        vote: {
          id: vote.id,
          timestamp: vote.created_at
        },
        votifierSent
      }),
      { headers, status: 200 }
    );
    
  } catch (err) {
    console.error('Vote error:', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { headers, status: 500 }
    );
  }
}

// Deno serve handler
if (typeof Deno !== 'undefined') {
  Deno.serve(handleVote);
}
