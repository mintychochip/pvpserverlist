import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple keyword-based intent parser (no AI needed for basic wizard)
function parseIntent(message: string) {
  const lower = message.toLowerCase();
  
  // Game detection
  let game = 'minecraft';
  if (lower.includes('rust')) game = 'rust';
  else if (lower.includes('cs2') || lower.includes('csgo')) game = 'cs2';
  
  // Gamemode detection
  let gamemode = null;
  const gamemodes = [
    ['survival', 'survival'],
    ['smp', 'survival'],
    ['pvp', 'pvp'],
    ['factions', 'factions'],
    ['skyblock', 'skyblock'],
    ['creative', 'creative'],
    ['minigames', 'minigames'],
    ['hardcore', 'hardcore'],
    ['prison', 'prison'],
    ['modded', 'modded'],
    ['roleplay', 'rp'],
    ['rp', 'rp'],
    ['towny', 'towny'],
  ];
  
  for (const [keyword, mode] of gamemodes) {
    if (lower.includes(keyword)) {
      gamemode = mode;
      break;
    }
  }
  
  // Features detection
  const features: string[] = [];
  const featureMap: Record<string, string[]> = {
    'economy': ['economy', 'money', 'shop', 'trading'],
    'claims': ['claims', 'land claim', 'protection', 'grief protection'],
    'discord': ['discord', 'community', 'voice chat'],
    'events': ['events', 'tournaments', 'competitions'],
    'bedrock': ['bedrock', 'crossplay', 'pe', 'pocket'],
    'vanilla': ['vanilla', 'no plugins', 'pure'],
    'modded': ['mods', 'modpack', 'forge', 'fabric'],
    'quests': ['quests', 'missions', 'story'],
    'mmo': ['mmo', 'rpg elements', 'skills', 'mcmmo'],
  };
  
  for (const [feature, keywords] of Object.entries(featureMap)) {
    if (keywords.some(k => lower.includes(k))) {
      features.push(feature);
    }
  }
  
  return { game, gamemode, features };
}

function buildSearchQuery(intent: { game: string; gamemode: string | null; features: string[] }) {
  const parts = [intent.game];
  if (intent.gamemode) parts.push(intent.gamemode);
  parts.push(...intent.features);
  return parts.join(' ');
}

export const POST: APIRoute = async ({ request }) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, history = [] } = await request.json();

    if (!message || message.length < 2) {
      return new Response(JSON.stringify({ 
        response: 'Please tell me more about what kind of server you\'re looking for!',
        readyToSearch: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const intent = parseIntent(message);
    
    // If we have enough info, go straight to search
    if (intent.gamemode || intent.features.length > 0) {
      const searchQuery = buildSearchQuery(intent);
      return new Response(JSON.stringify({
        response: `I'll find you ${intent.gamemode || 'some'} ${intent.game} servers${intent.features.length > 0 ? ' with ' + intent.features.join(', ') : ''}!`,
        readyToSearch: true,
        searchQuery,
        intent
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Need more clarification
    const responses = [
      'What gamemode are you looking for? Popular options: Survival, PvP, Skyblock, Factions, Creative, Minigames',
      'Are you looking for a specific type of server? For example: SMP, hardcore, modded, or roleplay?',
      'Any specific features you want? Like economy, land claims, events, or Discord integration?',
    ];
    
    // Pick response based on conversation length
    const responseIndex = Math.min(history.length / 2, responses.length - 1);
    
    return new Response(JSON.stringify({
      response: responses[Math.floor(responseIndex)],
      readyToSearch: false,
      intent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Wizard chat error:', err);
    return new Response(JSON.stringify({ 
      response: 'I had trouble understanding that. Could you try rephrasing?',
      readyToSearch: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
