import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Minecraft server status check - Simple TCP approach without external lib
async function pingMinecraftServer(ip: string, port: number): Promise<{ online: boolean; motd?: string; players?: number; maxPlayers?: number; version?: string }> {
  try {
    // Use a dynamic import for the minecraft-server-util
    const { status } = await import('minecraft-server-util');
    const result = await status(ip, port, { timeout: 10000, enableSRV: true });
    
    // Extract MOTD text - handle both string and object formats
    let motd = '';
    if (typeof result.motd === 'string') {
      motd = result.motd;
    } else if (result.motd?.raw) {
      motd = result.motd.raw;
    } else if (result.motd?.clean) {
      motd = result.motd.clean;
    } else if (result.description) {
      motd = typeof result.description === 'string' ? result.description : JSON.stringify(result.description);
    }
    
    // Strip Minecraft color codes and formatting
    motd = motd.replace(/§[0-9a-fk-or]/gi, '').replace(/\u0000/g, '');
    
    return {
      online: true,
      motd: motd,
      players: result.players?.online || 0,
      maxPlayers: result.players?.max || 0,
      version: result.version?.name || 'Unknown'
    };
  } catch (err: any) {
    console.error('Minecraft ping error:', err.message);
    return { online: false };
  }
}

// GET /api/servers/[id]/verify-check - Check if MOTD contains token
export const GET: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  const url = new URL(request.url);
  const verificationId = url.searchParams.get('verification_id');
  
  if (!id || !verificationId) {
    return new Response(JSON.stringify({ error: 'Server ID and verification ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get verification request
    const verifyResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_verifications?id=eq.${encodeURIComponent(verificationId)}&server_id=eq.${encodeURIComponent(id)}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!verifyResponse.ok) {
      throw new Error('Failed to fetch verification');
    }
    
    const verifications = await verifyResponse.json();
    if (!verifications || verifications.length === 0) {
      return new Response(JSON.stringify({ error: 'Verification request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const verification = verifications[0];
    
    // Check if expired
    if (new Date(verification.expires_at) < new Date()) {
      // Update status to expired
      await fetch(`${supabaseUrl}/rest/v1/server_verifications?id=eq.${verificationId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'expired' })
      });
      
      return new Response(JSON.stringify({ error: 'Verification expired. Please start a new verification.' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get server details
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=ip,port,name`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const servers = await serverResponse.json();
    if (!servers || servers.length === 0) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const server = servers[0];
    
    // Ping the server to check MOTD
    const pingResult = await pingMinecraftServer(server.ip, server.port || 25565);
    
    if (!pingResult.online) {
      // Update attempts
      const newAttempts = (verification.attempts || 0) + 1;
      await fetch(`${supabaseUrl}/rest/v1/server_verifications?id=eq.${verificationId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          attempts: newAttempts,
          last_checked: new Date().toISOString()
        })
      });
      
      return new Response(JSON.stringify({
        verified: false,
        server_online: false,
        message: 'Server appears to be offline. Make sure your server is running.',
        attempts: newAttempts,
        remaining_attempts: Math.max(0, 10 - newAttempts)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if token is in MOTD
    const motd = pingResult.motd || '';
    const token = verification.verification_token;
    const tokenFound = motd.includes(token) || motd.includes(token.substring(0, 8));
    
    // Also check partial match (first 8 chars) in case full token was truncated
    const partialMatch = motd.toLowerCase().includes(token.substring(0, 8).toLowerCase());
    
    if (tokenFound || partialMatch) {
      // Verification successful!
      
      // Update verification status
      await fetch(`${supabaseUrl}/rest/v1/server_verifications?id=eq.${verificationId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          status: 'verified',
          verified_at: new Date().toISOString(),
          attempts: (verification.attempts || 0) + 1
        })
      });
      
      // Update server with verified owner
      await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          verified_owner: verification.owner_email || 'anonymous',
          verified_at: new Date().toISOString(),
          verification_id: verificationId
        })
      });
      
      // Create audit log entry
      await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          server_id: id,
          action: 'ownership_verified',
          details: { owner: verification.owner_email || 'anonymous' },
          created_at: new Date().toISOString()
        })
      });
      
      return new Response(JSON.stringify({
        verified: true,
        server_online: true,
        message: 'Server ownership verified successfully!',
        server: {
          id: id,
          name: server.name,
          ip: server.ip,
          port: server.port
        },
        owner: verification.owner_email || 'anonymous'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      // Token not found in MOTD
      const newAttempts = (verification.attempts || 0) + 1;
      
      await fetch(`${supabaseUrl}/rest/v1/server_verifications?id=eq.${verificationId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          attempts: newAttempts,
          last_checked: new Date().toISOString(),
          last_motd: motd.substring(0, 500) // Store for debugging
        })
      });
      
      return new Response(JSON.stringify({
        verified: false,
        server_online: true,
        current_motd: motd.substring(0, 200),
        expected_token: token.substring(0, 8) + '...',
        message: 'Token not found in MOTD. Make sure to add the full verification token to your server\'s MOTD in server.properties.',
        attempts: newAttempts,
        remaining_attempts: Math.max(0, 10 - newAttempts)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
  } catch (err: any) {
    console.error('Verification check error:', err);
    return new Response(JSON.stringify({ error: 'Failed to check verification status' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST for manual check (optional, allows checking with different params)
export const POST: APIRoute = async ({ params, request, locals }) => {
  return GET({ params, request, locals, cookies: {} as any });
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};