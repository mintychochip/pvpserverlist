/**
 * Server Verification API
 * Verify server ownership via MOTD challenge
 * POST /api/servers/[id]/verify - Generate challenge
 * GET /api/servers/[id]/verify?check=true - Verify challenge completed
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Generate random challenge code
function generateChallenge(): string {
  return 'GP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Store challenges (in production, use Redis or database)
const challenges = new Map<string, { code: string; expires: number }>();

export const POST: APIRoute = async ({ params, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const { id } = params;
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
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
    // Get server details
    const serverRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${id}&select=ip,port,name`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
    );
    
    if (!serverRes.ok) throw new Error('Failed to fetch server');
    const servers = await serverRes.json();
    if (!servers.length) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const server = servers[0];
    
    // Generate challenge
    const challenge = generateChallenge();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Store challenge (in production, use KV store)
    challenges.set(id, { code: challenge, expires });
    
    return new Response(JSON.stringify({
      success: true,
      server_id: id,
      server_name: server.name,
      challenge: challenge,
      instructions: [
        `Set your server's MOTD to: "${challenge}"`,
        'The challenge is valid for 10 minutes',
        'Click "Verify" once you\'ve updated the MOTD',
        'You can change your MOTD back after verification'
      ],
      expires_at: new Date(expires).toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Verify error:', err);
    return new Response(JSON.stringify({ error: 'Failed to generate challenge' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async ({ params, url, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const { id } = params;
  const check = url.searchParams.get('check');
  
  if (!id || !check) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
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
  
  const challengeData = challenges.get(id);
  if (!challengeData) {
    return new Response(JSON.stringify({ error: 'No active challenge' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  if (Date.now() > challengeData.expires) {
    challenges.delete(id);
    return new Response(JSON.stringify({ error: 'Challenge expired' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get server IP and port
    const serverRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${id}&select=ip,port`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
    );
    
    const servers = await serverRes.json();
    if (!servers.length) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { ip, port } = servers[0];
    
    // Query server MOTD
    const { status } = await import('minecraft-server-util');
    const result = await status(ip, port, { timeout: 10000 });
    
    // Check if challenge code is in MOTD
    const motd = result.motd?.clean || result.motd?.raw || '';
    const verified = motd.includes(challengeData.code);
    
    if (verified) {
      // Mark server as verified
      await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ verified: true, verified_at: new Date().toISOString() })
      });
      
      challenges.delete(id);
      
      return new Response(JSON.stringify({
        success: true,
        verified: true,
        message: 'Server ownership verified! You can now claim this server.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        verified: false,
        message: 'Challenge not found in MOTD. Please ensure the server shows the challenge code.',
        current_motd: motd
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
  } catch (err: any) {
    console.error('Verify check error:', err);
    return new Response(JSON.stringify({ 
      error: 'Failed to check server. Server may be offline.' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};