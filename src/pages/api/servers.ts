import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const GET: APIRoute = async ({ locals }) => {
  // Access env vars from Cloudflare Pages runtime
  const env = (locals as any)?.runtime?.env || (globalThis as any).process?.env || {};
  const supabaseUrl = env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.PUBLIC_SUPABASE_ANON_KEY;

  // Debug: Log what's available (remove in production)
  console.log('Env check:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    envKeys: Object.keys(env).filter(k => !k.includes('SECRET') && !k.includes('KEY'))
  });

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ 
      error: 'Supabase not configured',
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=*&limit=10000`,
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

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
