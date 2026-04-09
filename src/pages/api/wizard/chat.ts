import type { APIRoute } from 'astro';

export const prerender = false;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Call Gemini API for AI-powered responses
async function callGemini(message: string, history: any[], apiKey: string) {
  const prompt = `You are Gemma, an AI assistant for GuildPost - a game server discovery platform. Help users find their ideal Minecraft server.

Available server types:
- Gamemodes: survival, smp, pvp, factions, skyblock, creative, minigames, hardcore, prison, modded, roleplay, towny
- Features: economy, claims, discord, events, bedrock, vanilla, quests, mmo, shops, crates, kits

Conversation history:
${history.map(h => `${h.role}: ${h.content}`).join('\n')}

User: ${message}

Respond naturally as a helpful assistant. If you have enough info to recommend servers (gamemode or specific features mentioned), include "SEARCH_READY: <query>" at the end where <query> is the search terms.

Gemma:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 300
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
        response: 'Hey there! Tell me what kind of Minecraft server you\'re looking for. For example: "survival with claims" or "pvp factions"',
        readyToSearch: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API key from environment
    const apiKey = import.meta.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      // Fallback to basic responses if no API key
      return new Response(JSON.stringify({ 
        response: 'I understand you\'re looking for a server! Try being more specific about the gamemode (survival, pvp, skyblock, etc.) and any features you want.',
        readyToSearch: false 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call Gemini AI
    const aiResponse = await callGemini(message, history, apiKey);
    
    // Check if AI indicated search is ready
    const searchMatch = aiResponse.match(/SEARCH_READY:\s*(.+)/i);
    const readyToSearch = !!searchMatch;
    const searchQuery = searchMatch ? searchMatch[1].trim() : null;
    
    // Clean up the response text
    const cleanResponse = aiResponse.replace(/SEARCH_READY:.*/i, '').trim();

    return new Response(JSON.stringify({
      response: cleanResponse || 'Tell me more about what kind of server you want!',
      readyToSearch,
      searchQuery,
      ai: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Wizard chat error:', err);
    return new Response(JSON.stringify({ 
      response: 'I\'m having trouble connecting to my AI brain right now. Try searching with keywords like "survival", "pvp", or "skyblock"!',
      readyToSearch: false,
      ai: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
