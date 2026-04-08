import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 1000;

  const supabaseUrl = locals.runtime?.env?.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = locals.runtime?.env?.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=id,host,port,game_mode&limit=${limit}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }

    const servers = await response.json();

    return new Response(JSON.stringify({
      servers,
      count: servers.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Servers list error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};