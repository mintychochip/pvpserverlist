import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// GET /api/alerts - Get alerts for a server
export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const serverId = url.searchParams.get('server_id');
  
  if (!serverId) {
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
    const response = await fetch(
      `${supabaseUrl}/rest/v1/server_alerts?server_id=eq.${encodeURIComponent(serverId)}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch alerts');
    }
    
    const alerts = await response.json();
    
    return new Response(JSON.stringify({
      alerts: alerts || [],
      server_id: serverId
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (err: any) {
    console.error('Get alerts error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch alerts' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/alerts - Create or update alert configuration
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
    const body = await request.json();
    const { 
      server_id, 
      alert_type, 
      is_enabled,
      email_enabled,
      email_address,
      discord_enabled,
      discord_webhook_url,
      discord_mention_role,
      player_drop_threshold,
      vote_milestone_threshold,
      cooldown_minutes,
      owner_email
    } = body;
    
    // Validation
    if (!server_id || !alert_type) {
      return new Response(JSON.stringify({ error: 'Server ID and alert type required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const validTypes = ['offline', 'online', 'player_drop', 'vote_milestone'];
    if (!validTypes.includes(alert_type)) {
      return new Response(JSON.stringify({ error: `Invalid alert type. Must be one of: ${validTypes.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify server ownership
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(server_id)}&select=id,name,verified_owner`,
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
    if (server.verified_owner && server.verified_owner !== owner_email) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Only the server owner can configure alerts' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate email if enabled
    if (email_enabled && email_address) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email_address)) {
        return new Response(JSON.stringify({ error: 'Invalid email address' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Validate Discord webhook if enabled
    if (discord_enabled && discord_webhook_url) {
      if (!discord_webhook_url.startsWith('https://discord.com/api/webhooks/')) {
        return new Response(JSON.stringify({ error: 'Invalid Discord webhook URL' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Check if alert config already exists
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_alerts?server_id=eq.${encodeURIComponent(server_id)}&alert_type=eq.${alert_type}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const existing = await existingResponse.json();
    const alertData = {
      server_id,
      alert_type,
      is_enabled: is_enabled ?? true,
      email_enabled: email_enabled ?? false,
      email_address: email_address || null,
      discord_enabled: discord_enabled ?? false,
      discord_webhook_url: discord_webhook_url || null,
      discord_mention_role: discord_mention_role || null,
      player_drop_threshold: player_drop_threshold || null,
      vote_milestone_threshold: vote_milestone_threshold || null,
      cooldown_minutes: cooldown_minutes || 60,
      updated_at: new Date().toISOString()
    };
    
    let result;
    
    if (existing && existing.length > 0) {
      // Update existing
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/server_alerts?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(alertData)
        }
      );
      
      if (!updateResponse.ok) {
        throw new Error('Failed to update alert');
      }
      
      result = await updateResponse.json();
    } else {
      // Create new
      alertData.created_at = new Date().toISOString();
      
      const createResponse = await fetch(`${supabaseUrl}/rest/v1/server_alerts`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(alertData)
      });
      
      if (!createResponse.ok) {
        throw new Error('Failed to create alert');
      }
      
      result = await createResponse.json();
    }
    
    // Create audit log
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        server_id: server_id,
        action: 'alert_configured',
        actor: owner_email || 'anonymous',
        details: { 
          alert_type, 
          is_enabled: alertData.is_enabled,
          has_email: !!alertData.email_address,
          has_discord: !!alertData.discord_webhook_url
        },
        created_at: new Date().toISOString()
      })
    });
    
    return new Response(JSON.stringify({
      success: true,
      alert: result[0],
      message: existing && existing.length > 0 ? 'Alert updated successfully' : 'Alert created successfully'
    }), {
      status: existing && existing.length > 0 ? 200 : 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Alert config error:', err);
    return new Response(JSON.stringify({ error: 'Failed to configure alert' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};