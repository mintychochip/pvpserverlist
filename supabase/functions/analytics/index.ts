// Server Analytics API
// Returns player count history for charting

import { createClient } from '@supabase/supabase-js';

export async function handleAnalytics(request: Request): Promise<Response> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }
  
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers, status: 405 }
    );
  }
  
  try {
    // Parse URL params
    const url = new URL(request.url);
    const serverId = url.searchParams.get('serverId');
    const hours = parseInt(url.searchParams.get('hours') || '24');
    
    if (!serverId) {
      return new Response(
        JSON.stringify({ error: 'Missing serverId parameter' }),
        { headers, status: 400 }
      );
    }
    
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get server info
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id, name, status, players_online, max_players, vote_count')
      .eq('id', serverId)
      .single();
    
    if (serverError || !server) {
      return new Response(
        JSON.stringify({ error: 'Server not found' }),
        { headers, status: 404 }
      );
    }
    
    // Get player history using the function
    const { data: history, error: historyError } = await supabase
      .rpc('get_player_history', {
        server_uuid: serverId,
        hours_back: hours,
        interval_minutes: 30
      });
    
    if (historyError) {
      console.error('History error:', historyError);
    }
    
    // Get uptime stats
    const { data: uptimeStats, error: uptimeError } = await supabase
      .rpc('get_server_uptime', {
        server_uuid: serverId,
        days: Math.ceil(hours / 24)
      });
    
    // Get peak times (optional)
    const { data: peakTimes, error: peakError } = await supabase
      .from('server_ping_history')
      .select('players_online, created_at')
      .eq('server_id', serverId)
      .eq('status', 'online')
      .order('players_online', { ascending: false })
      .limit(5);
    
    return new Response(
      JSON.stringify({
        server: {
          id: server.id,
          name: server.name,
          current_status: server.status,
          current_players: server.players_online,
          max_players: server.max_players,
          votes: server.vote_count
        },
        history: history || [],
        uptime: uptimeStats?.[0] || null,
        peak_times: peakTimes || [],
        period: {
          hours: hours,
          data_points: history?.length || 0
        }
      }),
      { headers }
    );
    
  } catch (err) {
    console.error('Analytics error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers, status: 500 }
    );
  }
}

// Deno serve
if (typeof Deno !== 'undefined') {
  Deno.serve(handleAnalytics);
}
