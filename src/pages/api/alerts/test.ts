import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// POST /api/alerts/test - Test alert configuration
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
    const { server_id, alert_type, test_email, test_discord } = body;
    
    if (!server_id || !alert_type) {
      return new Response(JSON.stringify({ error: 'Server ID and alert type required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get server info
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(server_id)}&select=name,ip,port`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const servers = await serverResponse.json();
    const server = servers?.[0];
    
    const testResults: any = {
      server_id,
      alert_type,
      tested_at: new Date().toISOString(),
      channels: {}
    };
    
    // Test Discord webhook if provided
    if (test_discord) {
      try {
        const discordPayload = {
          username: 'GuildPost Alerts',
          avatar_url: 'https://guildpost.tech/logo.png',
          embeds: [{
            title: '🧪 Test Alert',
            description: `This is a test alert for **${server?.name || 'Your Server'}**.\n\nIf you're seeing this, your Discord notifications are configured correctly!`,
            color: 0x00f5d4,
            fields: [
              {
                name: 'Server',
                value: server?.name || 'Unknown',
                inline: true
              },
              {
                name: 'Alert Type',
                value: alert_type,
                inline: true
              },
              {
                name: 'Time',
                value: new Date().toLocaleString(),
                inline: true
              }
            ],
            footer: {
              text: 'GuildPost Server Alerts'
            }
          }]
        };
        
        const discordResponse = await fetch(test_discord, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordPayload)
        });
        
        testResults.channels.discord = {
          success: discordResponse.ok,
          status: discordResponse.status,
          message: discordResponse.ok ? 'Test message sent successfully' : `Failed: ${discordResponse.statusText}`
        };
      } catch (err: any) {
        testResults.channels.discord = {
          success: false,
          error: err.message
        };
      }
    }
    
    // Email testing would go here - placeholder for now
    if (test_email) {
      testResults.channels.email = {
        success: true,
        message: 'Email test - integration pending (configure SendGrid/AWS SES)',
        note: 'Email alerts are not yet fully implemented. Discord alerts are ready to use.'
      };
    }
    
    return new Response(JSON.stringify(testResults), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Test alert error:', err);
    return new Response(JSON.stringify({ error: 'Failed to test alert' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};