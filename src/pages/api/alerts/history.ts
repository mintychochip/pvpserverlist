import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// GET /api/alerts/history - Get alert history for a server
export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const serverId = url.searchParams.get('server_id');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  
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
      `${supabaseUrl}/rest/v1/alert_history?server_id=eq.${encodeURIComponent(serverId)}&order=created_at.desc&limit=${limit}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch alert history');
    }
    
    const history = await response.json();
    
    return new Response(JSON.stringify({
      history: history || [],
      server_id: serverId,
      count: history?.length || 0
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (err: any) {
    console.error('Get alert history error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch alert history' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};