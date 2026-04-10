// Generate Discord bot invite link
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

  if (!DISCORD_CLIENT_ID) {
    return new Response(
      JSON.stringify({ error: 'Discord bot not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Permissions needed:
  // - View Channels (1024)
  // - Read Message History (65536)
  // - Send Messages (2048)
  // - Embed Links (16384)
  // Total: 1024 + 65536 + 2048 + 16384 = 84992
  const permissions = '84992';

  const inviteUrl = new URL('https://discord.com/oauth2/authorize');
  inviteUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
  inviteUrl.searchParams.set('scope', 'bot');
  inviteUrl.searchParams.set('permissions', permissions);

  return new Response(
    JSON.stringify({ 
      inviteUrl: inviteUrl.toString(),
      permissions: {
        viewChannels: true,
        sendMessages: true,
        readHistory: true,
        embedLinks: true,
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
};
