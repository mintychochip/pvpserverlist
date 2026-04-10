// Discord OAuth Callback - Verify Discord server ownership
import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Discord OAuth Config
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILDPOST_BOT_ID = process.env.GUILDPOST_BOT_ID || '';

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

export const GET: APIRoute = async ({ request, url }) => {
  // Handle CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get OAuth code and state from query params
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // Contains server_id and redirect_url
    
    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: 'Missing code or state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode state (base64 encoded JSON)
    let stateData: { serverId: string; redirectUrl: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { serverId, redirectUrl } = stateData;

    if (!serverId) {
      return new Response(
        JSON.stringify({ error: 'Missing server ID in state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${url.origin}/api/auth/discord/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Discord token exchange failed:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Discord' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user's guilds (servers they have access to)
    const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!guildsResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Discord guilds' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const guilds = await guildsResponse.json();

    // Check if GuildPost bot is in any of the user's guilds
    const verifiedGuild = await findGuildWithBot(guilds);

    if (!verifiedGuild) {
      // Redirect back with error - GuildPost bot not in any server
      const errorUrl = new URL(redirectUrl);
      errorUrl.searchParams.set('discord_error', 'bot_not_in_server');
      errorUrl.searchParams.set('discord_message', 'Please invite the GuildPost bot to your Discord server first');
      
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': errorUrl.toString(),
        },
      });
    }

    // Check if user has admin/manage server permissions in the guild
    const hasPermission = checkAdminPermission(verifiedGuild);

    if (!hasPermission) {
      const errorUrl = new URL(redirectUrl);
      errorUrl.searchParams.set('discord_error', 'no_permission');
      errorUrl.searchParams.set('discord_message', 'You need Administrator or Manage Server permissions');
      
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': errorUrl.toString(),
        },
      });
    }

    // Store verification in database
    await storeDiscordVerification(serverId, verifiedGuild);

    // Redirect back to success page
    const successUrl = new URL(redirectUrl);
    successUrl.searchParams.set('discord_verified', 'true');
    successUrl.searchParams.set('discord_guild', verifiedGuild.name);
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': successUrl.toString(),
      },
    });

  } catch (error) {
    console.error('Discord OAuth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

// Check if GuildPost bot is in any of the user's guilds
async function findGuildWithBot(guilds: any[]): Promise<any | null> {
  if (!DISCORD_BOT_TOKEN) {
    // If no bot token, we can't verify - skip this check
    return guilds[0] || null;
  }

  for (const guild of guilds) {
    // Check if our bot is in this guild
    try {
      const response = await fetch(`https://discord.com/api/guilds/${guild.id}/members/${GUILDPOST_BOT_ID}`, {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        },
      });

      if (response.ok) {
        // Bot is in this guild, verify user has admin perms
        const member = await response.json();
        
        // Check if bot can see the user (user is also in guild)
        const userInGuild = await fetch(`https://discord.com/api/guilds/${guild.id}/members/@me`, {
          headers: {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          },
        });

        if (userInGuild.ok) {
          return { ...guild, botMember: member };
        }
      }
    } catch (e) {
      console.error(`Failed to check guild ${guild.id}:`, e);
    }
  }

  return null;
}

// Check if user has admin or manage server permissions
function checkAdminPermission(guild: any): boolean {
  // Permissions are stored as bitfield in guild.permissions
  // ADMINISTRATOR = 0x8 (8)
  // MANAGE_GUILD = 0x20 (32)
  
  if (!guild.permissions) return false;
  
  const permissions = BigInt(guild.permissions);
  const ADMINISTRATOR = BigInt(0x8);
  const MANAGE_GUILD = BigInt(0x20);
  
  return (permissions & ADMINISTRATOR) === ADMINISTRATOR || 
         (permissions & MANAGE_GUILD) === MANAGE_GUILD;
}

// Store Discord verification in database
async function storeDiscordVerification(serverId: string, guild: any) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        discord_verified: true,
        discord_guild_id: guild.id,
        discord_guild_name: guild.name,
        discord_verified_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error('Failed to store Discord verification:', await response.text());
    }
  } catch (e) {
    console.error('Database error:', e);
  }
}
