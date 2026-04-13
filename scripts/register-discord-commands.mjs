#!/usr/bin/env node
/**
 * Register Discord slash commands for the GuildPost bot
 * Run: node scripts/register-discord-commands.mjs
 */

const DISCORD_API = 'https://discord.com/api/v10';

// Load from environment or 1Password
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const commands = [
  {
    name: 'search',
    description: 'Search for Minecraft servers on GuildPost',
    options: [
      {
        name: 'query',
        description: 'What kind of server are you looking for? (e.g., "pvp", "survival", "minigames")',
        type: 3, // STRING
        required: true,
        min_length: 3,
        max_length: 100,
      },
      {
        name: 'limit',
        description: 'Number of results to show (1-5)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 5,
      },
    ],
    integration_types: [0, 1], // Guild and user installs
    contexts: [0, 1, 2], // Guild, DM, and group DM contexts
  },
  {
    name: 'status',
    description: 'Check if the GuildPost bot is online',
    integration_types: [0, 1],
    contexts: [0, 1, 2],
  },
];

async function registerCommands() {
  if (!BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN environment variable is required');
    console.error('   Set it with: export DISCORD_BOT_TOKEN="your_bot_token"');
    process.exit(1);
  }

  if (!CLIENT_ID) {
    console.error('❌ DISCORD_CLIENT_ID environment variable is required');
    console.error('   Set it with: export DISCORD_CLIENT_ID="your_client_id"');
    process.exit(1);
  }

  const url = `${DISCORD_API}/applications/${CLIENT_ID}/commands`;

  console.log('🔄 Registering Discord slash commands...');
  console.log(`   Application ID: ${CLIENT_ID}`);
  console.log(`   Commands: ${commands.map(c => c.name).join(', ')}`);

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ Failed to register commands: ${response.status}`);
      console.error('   Error:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Commands registered successfully!');
    console.log('   Registered commands:');
    result.forEach(cmd => {
      console.log(`   - /${cmd.name} (${cmd.id})`);
    });

    console.log('\n📝 Next steps:');
    console.log('   1. Set up Interactions Endpoint URL in Discord Developer Portal:');
    console.log('      https://guildpost.tech/api/discord/interactions');
    console.log('   2. Set DISCORD_BOT_PUBLIC_KEY in Cloudflare Pages environment');
    console.log('   3. Invite bot to your server with: /api/discord/bot-invite');

  } catch (err) {
    console.error('❌ Error registering commands:', err.message);
    process.exit(1);
  }
}

// Delete all commands (useful for cleanup)
async function deleteAllCommands() {
  if (!BOT_TOKEN || !CLIENT_ID) {
    console.error('❌ DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID required');
    process.exit(1);
  }

  const listUrl = `${DISCORD_API}/applications/${CLIENT_ID}/commands`;

  try {
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Bot ${BOT_TOKEN}` },
    });

    if (!listRes.ok) {
      console.error('❌ Failed to list commands:', listRes.status);
      process.exit(1);
    }

    const commandList = await listRes.json();
    console.log(`🗑️  Deleting ${commandList.length} commands...`);

    for (const cmd of commandList) {
      const deleteUrl = `${DISCORD_API}/applications/${CLIENT_ID}/commands/${cmd.id}`;
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bot ${BOT_TOKEN}` },
      });
      console.log(`   Deleted /${cmd.name}`);
    }

    console.log('✅ All commands deleted');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);
if (args.includes('--delete') || args.includes('-d')) {
  deleteAllCommands();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node register-discord-commands.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --delete, -d    Delete all registered commands');
  console.log('  --help, -h      Show this help message');
  console.log('');
  console.log('Environment variables:');
  console.log('  DISCORD_BOT_TOKEN   Required - Bot token from Discord Developer Portal');
  console.log('  DISCORD_CLIENT_ID   Required - Application ID from Discord Developer Portal');
} else {
  registerCommands();
}
