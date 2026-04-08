import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// POST /api/reviews/[id]/response - Server owner responds to a review
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
    const { response, owner_email } = body;
    
    if (!response || response.length < 5 || response.length > 1000) {
      return new Response(JSON.stringify({ error: 'Response must be between 5 and 1000 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get review and verify server ownership
    const reviewResponse = await fetch(
      `${supabaseUrl}/rest/v1/reviews?id=eq.${encodeURIComponent(id)}&select=server_id,reviewer_minecraft_username,rating`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const reviews = await reviewResponse.json();
    if (!reviews || reviews.length === 0) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const review = reviews[0];
    
    // Verify server ownership
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(review.server_id)}&select=verified_owner`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const servers = await serverResponse.json();
    const server = servers?.[0];
    
    if (!server || server.verified_owner !== owner_email) {
      return new Response(JSON.stringify({ error: 'Only the server owner can respond to reviews' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if response already exists
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/review_responses?review_id=eq.${encodeURIComponent(id)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const existing = await existingResponse.json();
    
    if (existing && existing.length > 0) {
      // Update existing response
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/review_responses?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            response: response.trim(),
            updated_at: new Date().toISOString()
          })
        }
      );
      
      if (!updateResponse.ok) {
        throw new Error('Failed to update response');
      }
      
      const updated = await updateResponse.json();
      
      return new Response(JSON.stringify({
        success: true,
        response: updated[0],
        message: 'Response updated'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create new response
    const responseData = {
      review_id: id,
      server_id: review.server_id,
      response: response.trim(),
      responded_by: owner_email,
      is_official: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/review_responses`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(responseData)
    });
    
    if (!createResponse.ok) {
      throw new Error('Failed to create response');
    }
    
    const newResponse = await createResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      response: newResponse[0],
      message: 'Response posted'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Response error:', err);
    return new Response(JSON.stringify({ error: 'Failed to post response' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// DELETE /api/reviews/[id]/response - Delete owner response
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  const url = new URL(request.url);
  const owner_email = url.searchParams.get('owner_email');
  
  if (!id || !owner_email) {
    return new Response(JSON.stringify({ error: 'Review ID and owner email required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  try {
    // Verify ownership before deleting
    const responseData = await fetch(
      `${supabaseUrl}/rest/v1/review_responses?review_id=eq.${encodeURIComponent(id)}&select=server_id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const responses = await responseData.json();
    if (!responses || responses.length === 0) {
      return new Response(JSON.stringify({ error: 'Response not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify server ownership
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(responses[0].server_id)}&select=verified_owner`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const servers = await serverResponse.json();
    if (!servers?.[0] || servers[0].verified_owner !== owner_email) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Delete response
    const deleteResponse = await fetch(
      `${supabaseUrl}/rest/v1/review_responses?review_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!deleteResponse.ok) {
      throw new Error('Failed to delete response');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Response deleted'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Delete response error:', err);
    return new Response(JSON.stringify({ error: 'Failed to delete response' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};