// Discord OAuth Initiation - Start the verification flow
import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';

export const GET: APIRoute = async ({ request, url }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const serverId = url.searchParams.get('server_id');
  const redirectUrl = url.searchParams.get('redirect') || '/dashboard';

  if (!serverId) {
    return new Response(
      JSON.stringify({ error: 'Missing server_id parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!DISCORD_CLIENT_ID) {
    return new Response(
      JSON.stringify({ error: 'Discord OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Encode state with server ID and redirect URL
  const stateData = JSON.stringify({
    serverId,
    redirectUrl,
    timestamp: Date.now(),
  });
  const state = Buffer.from(stateData).toString('base64');

  // Build Discord OAuth URL
  const discordAuthUrl = new URL('https://discord.com/oauth2/authorize');
  discordAuthUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
  discordAuthUrl.searchParams.set('redirect_uri', `${url.origin}/api/auth/discord/callback`);
  discordAuthUrl.searchParams.set('response_type', 'code');
  discordAuthUrl.searchParams.set('scope', 'identify guilds');
  discordAuthUrl.searchParams.set('state', state);

  // Redirect to Discord
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      'Location': discordAuthUrl.toString(),
    },
  });
};
