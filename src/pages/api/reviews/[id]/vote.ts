import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// POST /api/reviews/[id]/vote - Vote helpful or not helpful
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Review ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body = await request.json();
    const { minecraft_username, is_helpful } = body;
    
    if (!minecraft_username || typeof is_helpful !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Minecraft username and vote type required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if already voted
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/review_votes?review_id=eq.${encodeURIComponent(id)}&voter_minecraft_username=eq.${encodeURIComponent(minecraft_username.toLowerCase())}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const existing = await existingResponse.json();
    
    if (existing && existing.length > 0) {
      // Update existing vote
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/review_votes?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            is_helpful: is_helpful,
            created_at: new Date().toISOString()
          })
        }
      );
      
      if (!updateResponse.ok) {
        throw new Error('Failed to update vote');
      }
      
      const updated = await updateResponse.json();
      
      return new Response(JSON.stringify({
        success: true,
        vote: updated[0],
        message: 'Vote updated'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create new vote
    const voteData = {
      review_id: id,
      voter_minecraft_username: minecraft_username.toLowerCase().trim(),
      is_helpful: is_helpful,
      created_at: new Date().toISOString()
    };
    
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/review_votes`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(voteData)
    });
    
    if (!createResponse.ok) {
      throw new Error('Failed to create vote');
    }
    
    const newVote = await createResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      vote: newVote[0],
      message: is_helpful ? 'Marked as helpful' : 'Marked as not helpful'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Vote error:', err);
    return new Response(JSON.stringify({ error: 'Failed to submit vote' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// DELETE /api/reviews/[id]/vote - Remove vote
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  const url = new URL(request.url);
  const minecraft_username = url.searchParams.get('minecraft_username');
  
  if (!id || !minecraft_username) {
    return new Response(JSON.stringify({ error: 'Review ID and username required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/review_votes?review_id=eq.${encodeURIComponent(id)}&voter_minecraft_username=eq.${encodeURIComponent(minecraft_username.toLowerCase())}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to delete vote');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Vote removed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Delete vote error:', err);
    return new Response(JSON.stringify({ error: 'Failed to remove vote' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};