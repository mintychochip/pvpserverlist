/**
 * Search Suggestions API Endpoint for Astro SSR
 * GET /api/search/suggestions - AI-powered search suggestions using Gemma
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Fallback suggestions when API unavailable
function generateFallbackSuggestions(query: string) {
  const q = query.toLowerCase();
  return [
    `${q} pvp server`,
    `${q} survival smp`,
    `${q} skyblock`,
    `${q} factions`,
    `${q} minigames`
  ];
}

export const GET: APIRoute = async ({ url, locals }) => {
  const runtime = locals.runtime;
  const env = runtime.env;
  
  const query = url.searchParams.get('q') || '';

  if (query.length < 2) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ suggestions: generateFallbackSuggestions(query) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const prompt = `You are a Minecraft server search assistant. Given a partial search query, suggest 5 relevant completions. Return ONLY a JSON array of strings, no other text.

Query: "${query}"

Suggestions (JSON array only):`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemma API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse suggestions from response
    let suggestions = [];
    try {
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        suggestions = JSON.parse(match[0]);
      }
    } catch {
      suggestions = generateFallbackSuggestions(query);
    }

    return new Response(JSON.stringify({ 
      query,
      suggestions: suggestions.slice(0, 5)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ 
      query,
      suggestions: generateFallbackSuggestions(query)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
