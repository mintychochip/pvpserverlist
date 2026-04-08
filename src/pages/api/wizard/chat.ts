/**
 * Wizard Chat API - AI-powered conversational intent extraction using Gemma via Gemini API
 * POST /api/wizard/chat - Chat with Gemma AI to refine search intent
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// System prompt for the wizard
const SYSTEM_PROMPT = `You are an AI assistant helping users find game servers on GuildPost. 

Your goal is to extract what the user wants and either:
1. Ask a clarifying question if intent is unclear
2. Confirm you have enough info and provide a search query

Games available: Minecraft (live), Rust (coming soon), CS2 (coming soon)

For Minecraft servers, extract:
- Gamemode: survival, pvp, skyblock, creative, minigames, hardcore, smp, modded, prison, rp
- Features: economy, claims, community, pvp, mmo, events, bedrock, shops, towny, quests, vanilla, kits
- Size: small (1-50), medium (50-200), large (200+)

Respond in JSON format:
{
  "response": "friendly message to user - either asking a question OR confirming search",
  "readyToSearch": boolean,
  "searchQuery": "constructed query if ready (e.g., 'minecraft survival economy small')",
  "extractedIntent": {
    "game": "minecraft|rust|cs2",
    "gamemode": "survival|pvp|etc or null",
    "features": ["economy", "claims"],
    "size": "small|medium|large or null"
  }
}

Rules:
- If user mentions "survival", "smp", "vanilla" → gamemode=survival
- If user mentions "pvp", "factions", "raid" → gamemode=pvp  
- If user mentions "skyblock" → gamemode=skyblock
- Ask for clarification if: no gamemode detected AND less than 2 features
- Be conversational and friendly, use emojis occasionally
- If unclear, ask ONE specific question (don't overwhelm)`;

// Call Gemma via Google AI Studio API
async function callGemma(messages: any[], apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemma-2-2b-it:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
          { role: 'model', parts: [{ text: 'I understand. I will help users find game servers by extracting their intent and asking clarifying questions when needed. I will respond in the specified JSON format.' }] },
          ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini API error:', response.status, error);
    throw new Error(`AI Studio API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  console.log('Gemma response:', text);
  
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // If no JSON found, use the text directly
    return {
      response: text,
      readyToSearch: false,
      searchQuery: null,
      extractedIntent: { game: null, gamemode: null, features: [], size: null }
    };
  } catch (e) {
    console.error('Failed to parse response:', e);
    return {
      response: text || "Tell me more about what kind of server you're looking for!",
      readyToSearch: false,
      searchQuery: null,
      extractedIntent: { game: null, gamemode: null, features: [], size: null }
    };
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const apiKey = env.GEMINI_API_KEY;

  try {
    const { message, history = [] } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build conversation for Gemma
    const conversation = [
      ...history.slice(-6),
      { role: 'user', content: message }
    ];

    let result;
    if (apiKey) {
      try {
        result = await callGemma(conversation, apiKey);
      } catch (apiError: any) {
        console.error('Gemma API failed:', apiError);
        // Smart fallback based on message content
        result = generateSmartFallback(message);
      }
    } else {
      console.log('No API key, using keyword fallback');
      result = generateSmartFallback(message);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Wizard chat error:', err);
    return new Response(JSON.stringify({ 
      response: "I'm having trouble with my AI. Tell me: what game and what style? (e.g., 'Minecraft survival')",
      readyToSearch: false,
      searchQuery: null,
      fallback: true
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// Smart fallback that actually parses the message
function generateSmartFallback(message: string) {
  const lower = message.toLowerCase();
  
  // Extract gamemode
  let gamemode = null;
  if (/\b(survival|smp|vanilla)\b/.test(lower)) gamemode = 'survival';
  else if (/\b(pvp|factions|raid|raiding)\b/.test(lower)) gamemode = 'pvp';
  else if (/\b(skyblock|island)\b/.test(lower)) gamemode = 'skyblock';
  else if (/\b(creative|build|plot)\b/.test(lower)) gamemode = 'creative';
  else if (/\b(minigame|bedwars|skywars)\b/.test(lower)) gamemode = 'minigames';
  else if (/\b(hardcore|deathban)\b/.test(lower)) gamemode = 'hardcore';
  else if (/\b(prison|mines)\b/.test(lower)) gamemode = 'prison';
  else if (/\b(modded|forge|fabric)\b/.test(lower)) gamemode = 'modded';
  
  // Extract features
  const features: string[] = [];
  if (/\b(economy|money|trading|shop)\b/.test(lower)) features.push('economy');
  if (/\b(claim|land|protect|grief)\b/.test(lower)) features.push('claims');
  if (/\b(community|discord|friendly|social)\b/.test(lower)) features.push('community');
  if (/\b(pvp|combat)\b/.test(lower)) features.push('pvp');
  if (/\b(mmo|mcmmo|rpg|skills)\b/.test(lower)) features.push('mmo');
  if (/\b(events|bosses|seasons)\b/.test(lower)) features.push('events');
  if (/\b(bedrock|console|mobile)\b/.test(lower)) features.push('bedrock');
  if (/\b(shop|market|player shop)\b/.test(lower)) features.push('shops');
  if (/\b(towny|town|nation)\b/.test(lower)) features.push('towny');
  if (/\b(quests|missions|story)\b/.test(lower)) features.push('quests');
  if (/\b(vanilla|pure|no plugins)\b/.test(lower)) features.push('vanilla');
  
  // Extract size
  let size = null;
  if (/\b(small|tiny|close knit)\b/.test(lower)) size = 'small';
  else if (/\b(medium|mid size)\b/.test(lower)) size = 'medium';
  else if (/\b(large|big|huge|massive)\b/.test(lower)) size = 'large';
  
  // Build response based on what we found
  const hasGamemode = !!gamemode;
  const hasFeatures = features.length >= 2;
  
  if (hasGamemode && hasFeatures) {
    const query = ['minecraft', gamemode, ...features, size].filter(Boolean).join(' ');
    return {
      response: `Got it! You want a ${gamemode} server${features.length ? ' with ' + features.join(', ') : ''}${size ? ' (' + size + ' community)' : ''}. Let me find some options!`,
      readyToSearch: true,
      searchQuery: query,
      extractedIntent: { game: 'minecraft', gamemode, features, size }
    };
  } else if (hasGamemode) {
    return {
      response: `I see you want a ${gamemode} server! What features are important to you? (economy, claims, pvp, events, etc.)`,
      readyToSearch: false,
      searchQuery: null,
      extractedIntent: { game: 'minecraft', gamemode, features, size }
    };
  } else if (features.length) {
    return {
      response: `You want features like ${features.join(', ')}! What gamemode do you prefer? (survival, pvp, skyblock, creative, minigames)`,
      readyToSearch: false,
      searchQuery: null,
      extractedIntent: { game: 'minecraft', gamemode, features, size }
    };
  } else {
    return {
      response: "I'd love to help you find a server! 🎮\n\nWhat gamemode interests you? (survival, pvp, skyblock, creative, minigames, hardcore)",
      readyToSearch: false,
      searchQuery: null,
      extractedIntent: { game: null, gamemode: null, features: [], size: null }
    };
  }
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};