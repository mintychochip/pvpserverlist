import type { APIRoute } from 'astro';
import { status } from 'minecraft-server-util';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  
  const host = url.searchParams.get('host');
  const port = parseInt(url.searchParams.get('port') || '25565');
  const timeout = parseInt(url.searchParams.get('timeout') || '5000');
  
  if (!host) {
    return new Response(JSON.stringify({ error: 'host parameter required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const start = Date.now();
    const result = await status(host, port, { timeout });
    const latency = Date.now() - start;
    
    return new Response(JSON.stringify({
      success: true,
      online: true,
      host,
      port,
      latency_ms: latency,
      players: {
        online: result.players?.online || 0,
        max: result.players?.max || 0,
      },
      version: result.version?.name || 'Unknown',
      motd: result.motd?.raw || result.motd?.clean || '',
      favicon: result.favicon || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      online: false,
      host,
      port,
      error: err.message || 'Server unreachable',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  
  const { host, port = 25565, timeout = 5000 } = await request.json();
  
  if (!host) {
    return new Response(JSON.stringify({ error: 'host required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const start = Date.now();
    const result = await status(host, port, { timeout });
    const latency = Date.now() - start;
    
    return new Response(JSON.stringify({
      success: true,
      online: true,
      host,
      port,
      latency_ms: latency,
      players: {
        online: result.players?.online || 0,
        max: result.players?.max || 0,
      },
      version: result.version?.name || 'Unknown',
      motd: result.motd?.raw || result.motd?.clean || '',
      favicon: result.favicon || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      online: false,
      host,
      port,
      error: err.message || 'Server unreachable',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
