import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// POST /api/servers/verify - Start verification process
export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const { server_id, owner_email, owner_name } = await request.json();
    
    if (!server_id) {
      return new Response(JSON.stringify({ error: 'Server ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if server exists
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(server_id)}&select=id,name,ip,port,verified_owner`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!serverResponse.ok) {
      throw new Error('Failed to fetch server');
    }
    
    const servers = await serverResponse.json();
    if (!servers || servers.length === 0) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const server = servers[0];
    
    // Check if already verified by someone else
    if (server.verified_owner && server.verified_owner !== owner_email) {
      return new Response(JSON.stringify({ error: 'Server already verified by another owner' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Generate verification token
    const verificationToken = generateUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    // Store verification request
    const verifyResponse = await fetch(`${supabaseUrl}/rest/v1/server_verifications`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        server_id: server_id,
        verification_token: verificationToken,
        owner_email: owner_email || null,
        owner_name: owner_name || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        attempts: 0
      })
    });
    
    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('Failed to create verification:', errorText);
      throw new Error('Failed to create verification request');
    }
    
    const verification = await verifyResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      server_id: server_id,
      server_name: server.name,
      verification_token: verificationToken,
      verification_id: verification[0]?.id,
      expires_at: expiresAt,
      instructions: `Add this token to your server's MOTD: ${verificationToken}`,
      motd_example: `§aMy Server §7| §fVerification: ${verificationToken.substring(0, 8)}...`,
      server_ip: server.ip,
      server_port: server.port
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Verification start error:', err);
    return new Response(JSON.stringify({ error: 'Failed to start verification' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};