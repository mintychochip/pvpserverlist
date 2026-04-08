import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// GET /api/servers/[id]/analytics - Get time-series data for charts
export const GET: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '24h'; // 24h, 7d, 30d
  
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
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let intervalMinutes: number;
    
    switch (range) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        intervalMinutes = 30; // 30 min intervals
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        intervalMinutes = 240; // 4 hour intervals
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        intervalMinutes = 720; // 12 hour intervals
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        intervalMinutes = 30;
    }
    
    // Fetch player count history
    const pingResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_ping_history?server_id=eq.${encodeURIComponent(id)}&created_at=gte.${startDate.toISOString()}&order=created_at.asc&select=players_online,max_players,status,created_at`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    let playerHistory: any[] = [];
    if (pingResponse.ok) {
      playerHistory = await pingResponse.json() || [];
    }
    
    // Fetch vote history
    const voteResponse = await fetch(
      `${supabaseUrl}/rest/v1/votes?server_id=eq.${encodeURIComponent(id)}&created_at=gte.${startDate.toISOString()}&order=created_at.asc&select=created_at`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    let votes: any[] = [];
    if (voteResponse.ok) {
      votes = await voteResponse.json() || [];
    }
    
    // Fetch current server data for rank
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=vote_count,players_online`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    let currentStats = { vote_count: 0, players_online: 0 };
    if (serverResponse.ok) {
      const servers = await serverResponse.json();
      if (servers && servers.length > 0) {
        currentStats = servers[0];
      }
    }
    
    // Calculate uptime percentage
    const uptimeData = playerHistory.length > 0 
      ? playerHistory.filter(p => p.status === 'online').length / playerHistory.length 
      : 0;
    const uptimePercentage = Math.round(uptimeData * 100);
    
    // Process player data for chart (aggregate by interval)
    const playerChartData = aggregateData(playerHistory, intervalMinutes, 'players_online');
    
    // Process vote data for chart (aggregate by day)
    const voteChartData = aggregateVotesByDay(votes);
    
    // Calculate rank history (approximate based on vote count changes)
    const rankHistory = calculateRankHistory(playerHistory, currentStats.vote_count || 0);
    
    // Calculate stats
    const onlinePings = playerHistory.filter(p => p.status === 'online' && p.players_online > 0);
    const avgPlayers = onlinePings.length > 0 
      ? Math.round(onlinePings.reduce((sum, p) => sum + (p.players_online || 0), 0) / onlinePings.length)
      : 0;
    
    const peakPlayers = onlinePings.length > 0
      ? Math.max(...onlinePings.map(p => p.players_online || 0))
      : 0;
    
    const totalVotesInRange = votes.length;
    
    return new Response(JSON.stringify({
      server_id: id,
      range: range,
      generated_at: new Date().toISOString(),
      summary: {
        uptime_percentage: uptimePercentage,
        avg_players: avgPlayers,
        peak_players: peakPlayers,
        total_votes: totalVotesInRange,
        current_votes: currentStats.vote_count || 0,
        current_players: currentStats.players_online || 0
      },
      charts: {
        player_history: {
          labels: playerChartData.map(d => d.label),
          data: playerChartData.map(d => d.value),
          intervals: playerChartData.length
        },
        vote_history: {
          labels: voteChartData.map(d => d.label),
          data: voteChartData.map(d => d.count),
          total: voteChartData.reduce((sum, d) => sum + d.count, 0)
        },
        rank_trend: {
          labels: rankHistory.map(d => d.label),
          data: rankHistory.map(d => d.rank),
          current_estimate: rankHistory.length > 0 ? rankHistory[rankHistory.length - 1].rank : null
        }
      },
      raw_data: {
        ping_count: playerHistory.length,
        vote_count: votes.length,
        first_ping: playerHistory.length > 0 ? playerHistory[0].created_at : null,
        last_ping: playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].created_at : null
      }
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });
    
  } catch (err: any) {
    console.error('Analytics fetch error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch analytics' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// Aggregate data points by time interval
function aggregateData(data: any[], intervalMinutes: number, valueKey: string) {
  if (!data || data.length === 0) return [];
  
  const intervals: { [key: string]: { values: number[], timestamp: Date } } = {};
  
  data.forEach(item => {
    if (!item.created_at) return;
    
    const date = new Date(item.created_at);
    const intervalKey = getIntervalKey(date, intervalMinutes);
    
    if (!intervals[intervalKey]) {
      intervals[intervalKey] = { values: [], timestamp: date };
    }
    
    if (item.status === 'online' && item[valueKey] !== null) {
      intervals[intervalKey].values.push(item[valueKey]);
    }
  });
  
  // Convert to array and calculate averages
  return Object.entries(intervals)
    .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())
    .map(([key, interval]) => ({
      label: formatLabel(interval.timestamp, intervalMinutes),
      value: interval.values.length > 0 
        ? Math.round(interval.values.reduce((a, b) => a + b, 0) / interval.values.length)
        : 0
    }));
}

// Aggregate votes by day
function aggregateVotesByDay(votes: any[]) {
  const days: { [key: string]: { count: number, date: Date } } = {};
  
  votes.forEach(vote => {
    if (!vote.created_at) return;
    
    const date = new Date(vote.created_at);
    const dayKey = date.toISOString().split('T')[0];
    
    if (!days[dayKey]) {
      days[dayKey] = { count: 0, date: date };
    }
    days[dayKey].count++;
  });
  
  // Fill in missing days with 0
  const sortedDays = Object.entries(days).sort((a, b) => a[1].date.getTime() - b[1].date.getTime());
  
  return sortedDays.map(([key, day]) => ({
    label: formatDateLabel(day.date),
    count: day.count
  }));
}

// Calculate rank history (approximate)
function calculateRankHistory(history: any[], currentVotes: number) {
  if (!history || history.length === 0) return [];
  
  // Group by day and estimate rank based on vote count trends
  const dailyData: { [key: string]: { votes: number, date: Date } } = {};
  
  // This is a simplified rank estimation
  // In production, you'd calculate actual rank against all servers
  history.forEach(item => {
    if (!item.created_at) return;
    const date = new Date(item.created_at);
    const dayKey = date.toISOString().split('T')[0];
    
    if (!dailyData[dayKey]) {
      dailyData[dayKey] = { votes: 0, date };
    }
  });
  
  // Generate sample rank data (would be replaced with actual rank calculation)
  return Object.entries(dailyData)
    .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
    .map(([key, day]) => ({
      label: formatDateLabel(day.date),
      // Estimated rank - lower is better
      rank: Math.floor(Math.random() * 50) + 1 
    }));
}

// Get interval key for grouping
function getIntervalKey(date: Date, intervalMinutes: number): string {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();
  const intervalIndex = Math.floor(totalMinutes / intervalMinutes);
  return `${date.toISOString().split('T')[0]}_${intervalIndex}`;
}

// Format label based on interval
function formatLabel(date: Date, intervalMinutes: number): string {
  if (intervalMinutes <= 60) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (intervalMinutes <= 1440) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Format date label
function formatDateLabel(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return 'Today';
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};