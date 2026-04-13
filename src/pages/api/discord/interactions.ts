import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Signature-Ed25519, X-Signature-Timestamp',
};

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

// Verify Discord interaction signature
async function verifyDiscordSignature(
  request: Request,
  publicKey: string
): Promise<{ valid: boolean; body?: any }> {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  if (!signature || !timestamp || !publicKey) {
    return { valid: false };
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp, 10);
  if (Math.abs(now - timestampNum) > 300) {
    return { valid: false };
  }

  const body = await request.text();

  try {
    // Use Web Crypto API for Ed25519 verification
    const encoder = new TextEncoder();
    const message = encoder.encode(timestamp + body);
    const sigHex = signature.replace(/[^0-9a-fA-F]/g, '');
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const keyHex = publicKey.replace(/[^0-9a-fA-F]/g, '');
    const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

    const publicKeyCrypto = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    const isValid = await crypto.subtle.verify(
      'Ed25519',
      publicKeyCrypto,
      sigBytes,
      message
    );

    if (isValid) {
      return { valid: true, body: JSON.parse(body) };
    }
  } catch (err) {
    console.error('Signature verification error:', err);
  }

  return { valid: false };
}

// Search for servers using hybrid search
async function searchServers(query: string, limit: number = 3): Promise<any[]> {
  try {
    const searchUrl = new URL('https://guildpost.tech/api/search/hybrid');
    
    const response = await fetch(searchUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'discord.com',
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
}

// Create Discord embed from server data
function createServerEmbed(server: any): any {
  const description = server.description 
    ? server.description.substring(0, 200) + (server.description.length > 200 ? '...' : '')
    : 'No description available';

  const fields = [
    { 
      name: 'Players', 
      value: `${server.player_count || 0}/${server.max_players || '?'}`, 
      inline: true 
    },
    { 
      name: 'Version', 
      value: server.version || 'Unknown', 
      inline: true 
    },
  ];

  if (server.votifier?.enabled) {
    fields.push({ 
      name: 'Votifier', 
      value: '✅ Enabled', 
      inline: true 
    });
  }

  return {
    title: server.name || 'Unknown Server',
    description,
    thumbnail: server.icon ? { url: server.icon } : undefined,
    fields,
    url: `https://guildpost.tech/servers/${server.id}`,
    color: 0x00f5d4, // GuildPost cyan
  };
}

// Handle /status command
async function handleStatusCommand(): Promise<any> {
  try {
    // Check API health
    const healthCheck = await fetch('https://guildpost.tech/api/health', {
      method: 'GET',
      headers: { 'Origin': 'discord.com' },
    }).catch(() => null);

    const isHealthy = healthCheck?.ok ?? false;

    const embed = {
      title: '🤖 GuildPost Bot Status',
      description: isHealthy
        ? 'All systems operational! The bot is online and ready to help you discover Minecraft servers.'
        : '⚠️ Some services may be experiencing issues. The search functionality might be limited.',
      color: isHealthy ? 0x00f5d4 : 0xff3864, // Cyan for healthy, pink for issues
      fields: [
        {
          name: 'Status',
          value: isHealthy ? '🟢 Online' : '🟡 Degraded',
          inline: true,
        },
        {
          name: 'Commands',
          value: '`/search` - Find servers\n`/status` - Check health',
          inline: true,
        },
        {
          name: 'Website',
          value: '[guildpost.tech](https://guildpost.tech)',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [embed],
      },
    };
  } catch (err) {
    console.error('Status check error:', err);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '⚠️ Unable to check status at this moment. Please try again later.',
        flags: 64,
      },
    };
  }
}

// Handle /search command
async function handleSearchCommand(interaction: any): Promise<any> {
  const options = interaction.data?.options || [];
  const queryOption = options.find((o: any) => o.name === 'query');
  const limitOption = options.find((o: any) => o.name === 'limit');

  const query = queryOption?.value?.trim();
  const limit = Math.min(Math.max(parseInt(limitOption?.value) || 3, 1), 5);

  if (!query || query.length < 3) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ Query must be at least 3 characters long.',
        flags: 64, // EPHEMERAL
      },
    };
  }

  // Defer response for potentially slow search
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64 },
  };

  // For now, return immediate response (Discord requires response within 3s)
  // In production, this would use a deferred webhook edit
  const results = await searchServers(query, limit);

  if (results.length === 0) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '🔍 No servers found matching your query. Try different keywords like "pvp", "survival", or "minigames"!',
        flags: 64,
      },
    };
  }

  const embeds = results.map(createServerEmbed);

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Found ${results.length} server${results.length > 1 ? 's' : ''} for "${query}":`,
      embeds,
    },
  };
}

// Main handler
export const POST: APIRoute = async ({ request, locals }: { request: Request; locals: any }) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runtimeEnv = locals?.runtime?.env || {};
  const publicKey = runtimeEnv.DISCORD_BOT_PUBLIC_KEY || process.env.DISCORD_BOT_PUBLIC_KEY;

  if (!publicKey) {
    return new Response(
      JSON.stringify({ error: 'Discord bot not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Clone request for signature verification (needs raw body)
  const requestClone = request.clone();
  const { valid, body } = await verifyDiscordSignature(requestClone, publicKey);

  if (!valid) {
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const interaction = body;

  // Handle Discord ping (URL verification)
  if (interaction.type === InteractionType.PING) {
    return new Response(
      JSON.stringify({ type: InteractionResponseType.PONG }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Handle slash commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name;

    if (commandName === 'search') {
      const response = await handleSearchCommand(interaction);
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (commandName === 'status') {
      const response = await handleStatusCommand();
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown command
    return new Response(
      JSON.stringify({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Unknown command.',
          flags: 64,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Default response for unhandled interaction types
  return new Response(
    JSON.stringify({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Interaction type not supported.',
        flags: 64,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
