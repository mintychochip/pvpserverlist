/**
 * Uptime Leaderboard API
 * Returns servers ranked by uptime percentage over a specified time period
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface UptimeServer {
  id: string;
  name: string;
  ip: string;
  port: number;
  description?: string;
  tags?: string[];
  icon_url?: string;
  banner_url?: string;
  vote_count: number;
  // Uptime stats
  total_pings: number;
  online_pings: number;
  uptime_percent: number;
  avg_players: number;
  max_players_seen: number;
  last_online_at?: string;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const days = parseInt(url.searchParams.get('days') || '7'); // Default to 7 days
  const minPings = parseInt(url.searchParams.get('min_pings') || '10'); // Minimum pings to qualify

  try {
    // Use the RPC function to calculate uptime for all servers
    // First, get servers with their ping history aggregated
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Query to get uptime stats from ping history
    const uptimeQuery = `
      SELECT
        s.id,
        s.name,
        s.ip,
        s.port,
        s.description,
        s.tags,
        s.icon_url,
        s.banner_url,
        s.vote_count,
        s.last_ping_at as last_online_at,
        COUNT(ph.id) as total_pings,
        COUNT(ph.id) FILTER (WHERE ph.online = true) as online_pings,
        ROUND(COUNT(ph.id) FILTER (WHERE ph.online = true) * 100.0 / NULLIF(COUNT(ph.id), 0), 2) as uptime_percent,
        ROUND(AVG(ph.players_online), 1) as avg_players,
        MAX(ph.players_online) as max_players_seen
      FROM servers s
      LEFT JOIN server_ping_history ph ON s.id = ph.server_id AND ph.pinged_at >= '${since}'
      WHERE s.verified = true OR s.verified IS NULL
      GROUP BY s.id, s.name, s.ip, s.port, s.description, s.tags, s.icon_url, s.banner_url, s.vote_count, s.last_ping_at
      HAVING COUNT(ph.id) >= ${minPings}
      ORDER BY uptime_percent DESC, vote_count DESC
      LIMIT ${limit}
    `;

    // Execute via Supabase REST API using the rpc endpoint for custom queries
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_uptime_leaderboard`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          days_back: days,
          result_limit: limit,
          min_pings_required: minPings
        })
      }
    );

    let servers: UptimeServer[] = [];

    if (response.ok) {
      servers = await response.json();
    } else {
      // Fallback: Fetch servers and ping history separately, then calculate
      console.log('RPC not available, using fallback query');

      // Get servers
      const serversResponse = await fetch(
        `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,description,tags,icon_url,banner_url,vote_count,last_ping_at&order=vote_count.desc&limit=200`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
      );

      if (!serversResponse.ok) {
        throw new Error(`Failed to fetch servers: ${await serversResponse.text()}`);
      }

      const allServers = await serversResponse.json();

      // Get ping history for these servers
      const serverIds = allServers.map((s: any) => s.id).join(',');
      const historyResponse = await fetch(
        `${supabaseUrl}/rest/v1/server_ping_history?select=server_id,online,players_online&pinged_at=gte.${since}&server_id=in.(${serverIds})`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
      );

      let pingHistory: any[] = [];
      if (historyResponse.ok) {
        pingHistory = await historyResponse.json();
      }

      // Calculate uptime for each server
      const historyByServer = pingHistory.reduce((acc, h) => {
        if (!acc[h.server_id]) acc[h.server_id] = [];
        acc[h.server_id].push(h);
        return acc;
      }, {});

      servers = allServers
        .map((server: any) => {
          const history = historyByServer[server.id] || [];
          const totalPings = history.length;
          const onlinePings = history.filter((h: any) => h.online).length;
          const uptimePercent = totalPings > 0
            ? Math.round((onlinePings / totalPings) * 100 * 100) / 100
            : 0;
          const avgPlayers = totalPings > 0
            ? Math.round((history.reduce((sum: number, h: any) => sum + (h.players_online || 0), 0) / totalPings) * 10) / 10
            : 0;
          const maxPlayers = totalPings > 0
            ? Math.max(...history.map((h: any) => h.players_online || 0))
            : 0;

          return {
            ...server,
            total_pings: totalPings,
            online_pings: onlinePings,
            uptime_percent: uptimePercent,
            avg_players: avgPlayers,
            max_players_seen: maxPlayers,
            last_online_at: server.last_ping_at
          };
        })
        .filter((s: UptimeServer) => s.total_pings >= minPings)
        .sort((a: UptimeServer, b: UptimeServer) => {
          if (b.uptime_percent !== a.uptime_percent) {
            return b.uptime_percent - a.uptime_percent;
          }
          return b.vote_count - a.vote_count;
        })
        .slice(0, limit);
    }

    // Calculate overall stats
    const totalServers = servers.length;
    const perfectUptime = servers.filter(s => s.uptime_percent === 100).length;
    const avgUptime = totalServers > 0
      ? Math.round(servers.reduce((sum, s) => sum + s.uptime_percent, 0) / totalServers * 100) / 100
      : 0;

    return new Response(JSON.stringify({
      servers,
      period: {
        days,
        since,
        description: `Last ${days} days`
      },
      stats: {
        total_servers: totalServers,
        perfect_uptime_count: perfectUptime,
        average_uptime: avgUptime
      },
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Uptime leaderboard error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to fetch uptime leaderboard',
      details: err.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
