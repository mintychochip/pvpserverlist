// Votifier Vote Service with Anti-Abuse
// Features: IP tracking, proxy/VPN detection, rate limiting, fingerprinting

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as net from 'net';

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

// Votifier 2.0 packet format
function createVotifierPacket(
  serviceName: string,
  username: string,
  address: string,
  timestamp: number,
  challenge: string
): string {
  return JSON.stringify({
    payload: {
      serviceName,
      username,
      address,
      timestamp,
      challenge
    }
  });
}

// Legacy Votifier 1.0 format (still widely used)
function createLegacyVotifierPacket(
  serviceName: string,
  username: string,
  address: string,
  timestamp: number
): string {
  const delim = '\n';
  return [
    'VOTE',
    serviceName,
    username,
    address,
    timestamp.toString()
  ].join(delim) + delim;
}

async function sendVotifierVote(
  serverIp: string,
  port: number,
  publicKey: string,
  username: string,
  serviceName: string = 'GuildPost'
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Clean up the public key
      const keyContent = publicKey
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '');
      
      const keyBuffer = Buffer.from(keyContent, 'base64');
      
      // Create vote payload
      const timestamp = Date.now();
      const address = 'guildpost.tech';
      const payload = createLegacyVotifierPacket(serviceName, username, address, timestamp);
      
      // Encrypt with RSA public key
      const encrypted = crypto.publicEncrypt(
        {
          key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
          padding: crypto.constants.RSA_PKCS1_PADDING
        },
        Buffer.from(payload)
      );
      
      // Send to Votifier
      const socket = new net.Socket();
      let connected = false;
      
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        connected = true;
        socket.write(encrypted);
      });
      
      socket.on('data', (data) => {
        // Votifier sends "VOTIFIER 1.9" or similar version on success
        socket.end();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
      
      socket.on('close', () => {
        if (!connected) {
          reject(new Error('Connection refused'));
        }
      });
      
      // Connect to server's Votifier port
      socket.connect(port, serverIp);
      
    } catch (err) {
      reject(err);
    }
  });
}

export async function handleVote(request: Request): Promise<Response> {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    
    // Send Votifier packet (if key is configured)
    let votifierSent = false;
    if (server.votifier_key) {
      try {
        votifierSent = await sendVotifierVote(
          server.ip,
          8192, // Default Votifier port (or use configured port)
          server.votifier_key,
          username
        );
        console.log('Votifier packet sent successfully');
      } catch (err) {
        console.error('Votifier send failed:', err);
        // Don't fail the vote if Votifier is down
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: votifierSent 
          ? 'Vote recorded and reward sent to server!' 
          : 'Vote recorded! Rewards will be sent when you join the server.',
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
