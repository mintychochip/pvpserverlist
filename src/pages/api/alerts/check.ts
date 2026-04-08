import type { APIRoute } from 'astro';
import { pingMinecraftServerAlt } from '../../../lib/minecraft-ping';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// POST /api/alerts/check - Background worker to check server status and send alerts
// This endpoint is designed to be called by a cron job every 1-5 minutes
export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('Authorization');
  const cronSecret = env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
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
  
  const results = {
    checked: 0,
    alerts_sent: 0,
    errors: [] as string[],
    details: [] as any[]
  };
  
  try {
    // Get all enabled alert configurations
    const alertsResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_alerts?is_enabled=eq.true&select=*,servers(id,name,ip,port,status,players_online,vote_count)`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!alertsResponse.ok) {
      throw new Error('Failed to fetch alert configurations');
    }
    
    const alerts = await alertsResponse.json();
    
    for (const alert of (alerts || [])) {
      const server = alert.servers;
      if (!server) continue;
      
      results.checked++;
      
      try {
        // Ping the server to check current status
        const pingResult = await pingMinecraftServerAlt(server.ip, server.port || 25565);
        
        const currentStatus = pingResult.online ? 'online' : 'offline';
        const currentPlayers = pingResult.players || 0;
        const previousStatus = alert.last_alert_status || server.status;
        
        let shouldAlert = false;
        let alertReason = '';
        let alertData: any = {};
        
        // Check alert conditions
        switch (alert.alert_type) {
          case 'offline':
            if (currentStatus === 'offline' && previousStatus !== 'offline') {
              shouldAlert = true;
              alertReason = 'Server went offline';
            }
            break;
            
          case 'online':
            if (currentStatus === 'online' && previousStatus === 'offline') {
              shouldAlert = true;
              alertReason = 'Server came back online';
            }
            break;
            
          case 'player_drop':
            if (alert.player_drop_threshold && 
                currentPlayers < alert.player_drop_threshold &&
                alert.last_alert_at && 
                (new Date().getTime() - new Date(alert.last_alert_at).getTime()) > alert.cooldown_minutes * 60 * 1000) {
              shouldAlert = true;
              alertReason = `Player count dropped below ${alert.player_drop_threshold}`;
            }
            break;
            
          case 'vote_milestone':
            // Check if votes reached a milestone
            if (alert.vote_milestone_threshold && server.vote_count > 0) {
              const previousMilestone = Math.floor((server.vote_count - 1) / alert.vote_milestone_threshold) * alert.vote_milestone_threshold;
              const currentMilestone = Math.floor(server.vote_count / alert.vote_milestone_threshold) * alert.vote_milestone_threshold;
              
              if (currentMilestone > previousMilestone && currentMilestone > 0) {
                shouldAlert = true;
                alertReason = `Vote milestone reached: ${currentMilestone} votes!`;
              }
            }
            break;
        }
        
        // Check cooldown
        if (shouldAlert && alert.last_alert_at) {
          const minutesSinceLastAlert = (new Date().getTime() - new Date(alert.last_alert_at).getTime()) / (60 * 1000);
          if (minutesSinceLastAlert < alert.cooldown_minutes) {
            shouldAlert = false;
            alertReason += ` (cooldown: ${Math.ceil(alert.cooldown_minutes - minutesSinceLastAlert)}m remaining)`;
          }
        }
        
        if (shouldAlert) {
          // Send notifications
          const notifications: any[] = [];
          
          // Discord notification
          if (alert.discord_enabled && alert.discord_webhook_url) {
            try {
              const discordPayload = buildDiscordPayload(alert, server, alertReason, currentStatus, currentPlayers);
              const discordResponse = await fetch(alert.discord_webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(discordPayload)
              });
              
              notifications.push({
                channel: 'discord',
                sent: discordResponse.ok,
                error: discordResponse.ok ? null : await discordResponse.text()
              });
            } catch (err: any) {
              notifications.push({
                channel: 'discord',
                sent: false,
                error: err.message
              });
            }
          }
          
          // Record in alert history
          await fetch(`${supabaseUrl}/rest/v1/alert_history`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              server_id: server.id,
              alert_type: alert.alert_type,
              alert_config_id: alert.id,
              trigger_reason: alertReason,
              previous_status: previousStatus,
              current_status: currentStatus,
              players_before: null, // Would need historical data
              players_after: currentPlayers,
              notification_channel: notifications.find(n => n.sent)?.channel || 'none',
              notification_sent: notifications.some(n => n.sent),
              notification_error: notifications.find(n => !n.sent)?.error || null,
              created_at: new Date().toISOString()
            })
          });
          
          // Update last alert timestamp
          await fetch(`${supabaseUrl}/rest/v1/server_alerts?id=eq.${alert.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              last_alert_at: new Date().toISOString(),
              last_alert_status: currentStatus,
              updated_at: new Date().toISOString()
            })
          });
          
          results.alerts_sent++;
          results.details.push({
            server: server.name,
            alert_type: alert.alert_type,
            reason: alertReason,
            notifications
          });
        }
        
      } catch (err: any) {
        results.errors.push(`Error checking ${server.name}: ${err.message}`);
      }
    }
    
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Alert check error:', err);
    return new Response(JSON.stringify({ 
      error: 'Failed to process alerts',
      details: err.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

function buildDiscordPayload(alert: any, server: any, reason: string, status: string, players: number) {
  const isOffline = status === 'offline';
  const color = isOffline ? 0xff3864 : 0x00f5d4;
  const emoji = isOffline ? '🔴' : '🟢';
  
  const embed: any = {
    title: `${emoji} ${server.name} - ${reason}`,
    color: color,
    timestamp: new Date().toISOString(),
    fields: [
      {
        name: 'Server',
        value: `${server.ip}:${server.port}`,
        inline: true
      },
      {
        name: 'Status',
        value: status.toUpperCase(),
        inline: true
      }
    ],
    footer: {
      text: 'GuildPost Server Alerts'
    }
  };
  
  if (!isOffline && players > 0) {
    embed.fields.push({
      name: 'Players Online',
      value: players.toString(),
      inline: true
    });
  }
  
  const payload: any = {
    username: 'GuildPost Alerts',
    avatar_url: 'https://guildpost.tech/logo.png',
    embeds: [embed]
  };
  
  // Add role mention if configured
  if (alert.discord_mention_role) {
    payload.content = `<@&${alert.discord_mention_role}>`;
  }
  
  return payload;
}

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};