// Check Discord verification status for a server
import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const supabaseUrl = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

export const GET: APIRoute = async ({ request, url }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const serverId = url.searchParams.get('server_id');

  if (!serverId) {
    return new Response(
      JSON.stringify({ error: 'Missing server_id parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&select=discord_verified,discord_guild_id,discord_guild_name,discord_verified_at`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch verification status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const server = data[0];

    if (!server) {
      return new Response(
        JSON.stringify({ error: 'Server not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        verified: server.discord_verified || false,
        guildId: server.discord_guild_id || null,
        guildName: server.discord_guild_name || null,
        verifiedAt: server.discord_verified_at || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Discord status check error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};
