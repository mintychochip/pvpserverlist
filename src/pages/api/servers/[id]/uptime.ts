import type { APIRoute } from 'astro';
import { getRuntime } from '@astrojs/cloudflare';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const GET: APIRoute = async ({ params, request, context }) => {
  const { id } = params;
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '1', 10);
  
  const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  
  // Use Cloudflare runtime for env vars on Cloudflare Pages
  let supabaseKey = '';
  try {
    const runtime = getRuntime(context);
    supabaseKey = runtime?.env?.SUPABASE_SERVICE_KEY || '';
  } catch {
    // Fallback for local dev
    supabaseKey = (import.meta as any).env?.SUPABASE_SERVICE_KEY || '';
  }
  
  if (!supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error - missing SUPABASE_SERVICE_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Fetch ping history from server_ping_history table
    const pingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_ping_history?server_id=eq.${id}&created_at=gte.${startDate.toISOString()}&order=created_at.asc&select=created_at,players_online,max_players,ping_ms`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!pingsResponse.ok) {
      const errorText = await pingsResponse.text();
      console.error('Supabase ping fetch error:', pingsResponse.status, errorText);
      throw new Error(`Failed to fetch ping history: ${pingsResponse.status}`);
    }
    
    const pings = await pingsResponse.json();
    
    // Get current server stats
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${id}&select=players_online,max_players,status,uptime_percentage`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    let currentStats = {};
    if (serverResponse.ok) {
      const servers = await serverResponse.json();
      if (servers.length > 0) {
        currentStats = servers[0];
      }
    }
    
    // Process data into chart format - use field names frontend expects
    const rawData = pings.map((ping: any) => ({
      time: ping.created_at,
      players_online: ping.players_online || 0,
      max_players: ping.max_players || 0,
      latency: ping.ping_ms || 0
    }));
    
    // Aggregate by day for longer periods
    let chartData: any[] = [];
    if (days > 1 && pings.length > 0) {
      const dailyMap = new Map();
      
      for (const ping of pings) {
        const date = ping.created_at.split('T')[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { 
            date, 
            players_sum: 0, 
            count: 0,
            avg_latency: 0,
            latency_count: 0
          });
        }
        const entry = dailyMap.get(date);
        entry.players_sum += ping.players_online || 0;
        entry.count++;
        if (ping.ping_ms) {
          entry.avg_latency += ping.ping_ms;
          entry.latency_count++;
        }
      }
      
      chartData = Array.from(dailyMap.values()).map((day: any) => ({
        time: day.date,
        avg_players: Math.round(day.players_sum / day.count),
        latency: day.latency_count > 0 ? Math.round(day.avg_latency / day.latency_count) : 0
      }));
    }
    
    // Calculate stats
    const avgPlayers = pings.length > 0 
      ? Math.round(pings.reduce((sum: number, p: any) => sum + (p.players_online || 0), 0) / pings.length)
      : 0;
    
    const avgLatency = pings.length > 0
      ? Math.round(pings.filter((p: any) => p.ping_ms).reduce((sum: number, p: any) => sum + (p.ping_ms || 0), 0) / pings.filter((p: any) => p.ping_ms).length) || 0
      : 0;
    
    return new Response(
      JSON.stringify({
        server_id: id,
        period: `${days}d`,
        current: currentStats,
        averages: {
          players_online: avgPlayers,
          latency: avgLatency
        },
        uptime: {
          percentage: currentStats.uptime_percentage || 0
        },
        stats: {
          avg_players: avgPlayers,
          peak_players: Math.max(...pings.map((p: any) => p.players_online || 0), currentStats.players_online || 0),
          avg_latency: avgLatency,
          total_pings: pings.length
        },
        chart_data: chartData.length > 0 ? chartData : rawData.map((d: any) => ({...d, avg_players: d.players_online})),
        raw_data: rawData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (err) {
    console.error('Uptime API error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};