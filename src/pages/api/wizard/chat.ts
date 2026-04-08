/**
 * Wizard Chat API - AI-powered conversational intent extraction using Gemini
 * POST /api/wizard/chat - Chat with AI to refine search intent
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

// Call Gemini API
async function callGemini(messages: any[], apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
          maxOutputTokens: 500,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  try {
    // Try to parse as JSON
    return JSON.parse(text);
  } catch {
    // Fallback: wrap text in expected format
    return {
      response: text || "I understand you're looking for a server. Could you tell me which game and gamemode you prefer?",
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

    // If no API key, fallback to simple keyword extraction
    if (!apiKey) {
      const lower = message.toLowerCase();
      const hasGamemode = /\b(survival|pvp|skyblock|creative|hardcore|minigames|smp|modded)\b/.test(lower);
      const hasFeatures = (lower.match(/\b(economy|claims|community|discord|pvp|events|bedrock|shops|towny|quests)\b/g) || []).length;
      
      if (hasGamemode || hasFeatures >= 2) {
        return new Response(JSON.stringify({
          response: "I'll search for servers matching what you described!",
          readyToSearch: true,
          searchQuery: `minecraft ${message}`,
          extractedIntent: { game: 'minecraft', gamemode: null, features: [], size: null }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      } else {
        return new Response(JSON.stringify({
          response: "I want to make sure I find the right server for you! 🎮\n\nWhat gamemode interests you? (survival, pvp, skyblock, creative, minigames, hardcore)",
          readyToSearch: false,
          searchQuery: null,
          extractedIntent: { game: null, gamemode: null, features: [], size: null }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
    }

    // Build conversation for Gemini
    const conversation = [
      ...history.slice(-6), // Keep last 3 exchanges
      { role: 'user', content: message }
    ];

    const result = await callGemini(conversation, apiKey);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Wizard chat error:', err);
    return new Response(JSON.stringify({ 
      response: "I'm having trouble connecting to my AI brain right now. Let me try a simpler approach - what game are you looking for? (Minecraft, Rust, or CS2)",
      readyToSearch: false,
      searchQuery: null,
      fallback: true
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};