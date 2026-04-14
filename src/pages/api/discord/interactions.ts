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
          value: '`/search` - Find servers\n`/top` - Top voted servers\n`/votes` - Vote stats\n`/status` - Bot health',
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

// Fetch top servers by vote count
async function fetchTopServers(category?: string, limit: number = 5): Promise<any[]> {
  try {
    const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
    const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
    
    // Build query URL
    let url = `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,description,vote_count,players_online,max_players,version,icon,tags&status=eq.online&order=vote_count.desc&limit=${limit}`;
    
    if (category) {
      url += `&tags=cs.{${category}}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('Fetch top servers error:', err);
    return [];
  }
}

// Handle /top command
async function handleTopCommand(interaction: any): Promise<any> {
  const options = interaction.data?.options || [];
  const categoryOption = options.find((o: any) => o.name === 'category');
  const limitOption = options.find((o: any) => o.name === 'limit');

  const category = categoryOption?.value?.trim();
  const limit = Math.min(Math.max(parseInt(limitOption?.value) || 5, 1), 5);

  try {
    const servers = await fetchTopServers(category, limit);

    if (servers.length === 0) {
      const categoryMsg = category ? ` in category "${category}"` : '';
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🔍 No servers found${categoryMsg}. Try a different category or check back later!`,
          flags: 64, // EPHEMERAL
        },
      };
    }

    const trophyEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    
    const embeds = servers.map((server, index) => {
      const emoji = trophyEmojis[index] || `${index + 1}.`;
      const description = server.description 
        ? server.description.substring(0, 150) + (server.description.length > 150 ? '...' : '')
        : 'No description available';

      return {
        title: `${emoji} ${server.name}`,
        description,
        thumbnail: server.icon ? { url: server.icon } : undefined,
        fields: [
          { 
            name: 'Votes', 
            value: (server.vote_count || 0).toLocaleString(), 
            inline: true 
          },
          { 
            name: 'Players', 
            value: `${server.players_online || 0}/${server.max_players || '?'}`, 
            inline: true 
          },
          { 
            name: 'Version', 
            value: server.version || 'Unknown', 
            inline: true 
          },
        ],
        url: `https://guildpost.tech/servers/${server.id}`,
        color: index === 0 ? 0xFFD700 : index === 1 ? 0xC0C0C0 : index === 2 ? 0xCD7F32 : 0x00f5d4,
      };
    });

    const categoryMsg = category ? ` in **${category}**` : '';

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `🏆 Top ${servers.length} Server${servers.length > 1 ? 's' : ''}${categoryMsg} on GuildPost:`,
        embeds,
      },
    };
  } catch (err) {
    console.error('Top command error:', err);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '⚠️ Unable to fetch top servers at this moment. Please try again later.',
        flags: 64,
      },
    };
  }
}

// Handle /votes command
async function handleVotesCommand(interaction: any): Promise<any> {
  const options = interaction.data?.options || [];
  const serverOption = options.find((o: any) => o.name === 'server');
  const serverName = serverOption?.value?.trim();

  if (!serverName || serverName.length < 3) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ Server name must be at least 3 characters long.',
        flags: 64, // EPHEMERAL
      },
    };
  }

  try {
    // Search for the server using hybrid search
    const searchResults = await searchServers(serverName, 1);
    
    if (searchResults.length === 0) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ No server found with that name. Please check the spelling and try again.',
          flags: 64, // EPHEMERAL
        },
      };
    }

    const server = searchResults[0];
    
    // Fetch vote analytics
    const votesResponse = await fetch(`https://guildpost.tech/api/servers/${server.id}/votes`, {
      headers: { 'Origin': 'discord.com' },
    });
    
    if (!votesResponse.ok) {
      throw new Error(`Votes API error: ${votesResponse.status}`);
    }
    
    const voteStats = await votesResponse.json();

    const embed = {
      title: `🗳️ Vote Stats for ${server.name}`,
      thumbnail: server.icon ? { url: server.icon } : undefined,
      fields: [
        {
          name: 'Votes (24h)',
          value: String(voteStats.votes_24h || 0),
          inline: true
        },
        {
          name: 'Trend',
          value: voteStats.vote_trend !== undefined 
            ? `${voteStats.vote_trend >= 0 ? '↗️' : '↘️'} ${voteStats.vote_trend.toFixed(1)}%`
            : 'N/A',
          inline: true
        },
        {
          name: 'Peak Hour',
          value: String(voteStats.top_hourly_votes || 0),
          inline: true
        }
      ],
      url: `https://guildpost.tech/servers/${server.id}`,
      color: 0x00f5d4, // GuildPost cyan
    };

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [embed],
      },
    };
  } catch (err) {
    console.error('Votes command error:', err);
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '⚠️ Unable to fetch vote stats at this moment. Please try again later.',
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

    if (commandName === 'votes') {
      const response = await handleVotesCommand(interaction);
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (commandName === 'top') {
      const response = await handleTopCommand(interaction);
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
