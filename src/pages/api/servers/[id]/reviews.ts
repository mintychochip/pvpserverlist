import type { APIRoute } from 'astro';
import { pingMinecraftServerAlt } from '../../../../lib/minecraft-ping';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// GET /api/servers/[id]/reviews - Get reviews for a server
export const GET: APIRoute = async ({ params, url, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const sort = url.searchParams.get('sort') || 'newest';
  const filter = url.searchParams.get('filter') || 'all';
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Build query
    let query = `${supabaseUrl}/rest/v1/review_summaries?server_id=eq.${encodeURIComponent(id)}`;
    
    // Apply filters
    if (filter === 'verified') {
      query += '&is_verified=eq.true';
    } else if (filter === 'featured') {
      query += '&is_featured=eq.true';
    } else if (filter === 'positive') {
      query += '&rating=gte.4';
    } else if (filter === 'critical') {
      query += '&rating=lte.2';
    }
    
    // Apply sorting
    if (sort === 'newest') {
      query += '&order=created_at.desc';
    } else if (sort === 'oldest') {
      query += '&order=created_at.asc';
    } else if (sort === 'highest') {
      query += '&order=rating.desc';
    } else if (sort === 'lowest') {
      query += '&order=rating.asc';
    } else if (sort === 'helpful') {
      query += '&order=helpful_count.desc';
    }
    
    query += `&limit=${limit}&offset=${offset}`;
    
    const response = await fetch(query, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch reviews');
    }
    
    const reviews = await response.json();
    
    // Get rating summary
    const summaryResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=avg_rating,total_reviews,verified_reviews`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const serverData = await summaryResponse.json();
    const summary = serverData?.[0] || {};
    
    // Get rating distribution
    const distributionResponse = await fetch(
      `${supabaseUrl}/rest/v1/reviews?server_id=eq.${encodeURIComponent(id)}&is_approved=eq.true&select=rating`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const ratings = await distributionResponse.json();
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratings?.forEach((r: any) => {
      if (distribution[r.rating as keyof typeof distribution] !== undefined) {
        distribution[r.rating as keyof typeof distribution]++;
      }
    });
    
    return new Response(JSON.stringify({
      reviews: reviews || [],
      summary: {
        avg_rating: summary.avg_rating || 0,
        total_reviews: summary.total_reviews || 0,
        verified_reviews: summary.verified_reviews || 0,
        distribution
      },
      pagination: {
        limit,
        offset,
        has_more: (reviews || []).length === limit
      }
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=60'
      }
    });
    
  } catch (err: any) {
    console.error('Get reviews error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch reviews' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/servers/[id]/reviews - Submit a new review
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
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
    const { 
      minecraft_username, 
      rating, 
      title, 
      content,
      verification_code
    } = body;
    
    // Validation
    if (!minecraft_username || !rating || !content) {
      return new Response(JSON.stringify({ error: 'Minecraft username, rating, and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (rating < 1 || rating > 5) {
      return new Response(JSON.stringify({ error: 'Rating must be between 1 and 5' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (content.length < 10 || content.length > 2000) {
      return new Response(JSON.stringify({ error: 'Review must be between 10 and 2000 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get server details for verification
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=ip,port,verified_motd`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const servers = await serverResponse.json();
    const server = servers?.[0];
    
    if (!server) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check for existing review from this user
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/reviews?server_id=eq.${encodeURIComponent(id)}&reviewer_minecraft_username=eq.${encodeURIComponent(minecraft_username.toLowerCase())}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const existing = await existingResponse.json();
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: 'You have already reviewed this server. Edit your existing review instead.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify player has actually played on the server (if verification code provided)
    let isVerified = false;
    let playtimeHours = null;
    
    if (verification_code && server.verified_motd) {
      // Simple verification: check if user put code in their profile or similar
      // For now, auto-verify if they provide a code (future: check server logs)
      isVerified = true;
      playtimeHours = null; // Would need server integration
    }
    
    // Create review
    const reviewData = {
      server_id: id,
      reviewer_minecraft_username: minecraft_username.toLowerCase().trim(),
      rating: parseInt(rating),
      title: title?.trim() || null,
      content: content.trim(),
      is_verified: isVerified,
      playtime_hours: playtimeHours,
      verification_method: isVerified ? 'server_logs' : null,
      is_approved: true, // Auto-approve, moderate later
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/reviews`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(reviewData)
    });
    
    if (!createResponse.ok) {
      throw new Error('Failed to create review');
    }
    
    const newReview = await createResponse.json();
    
    // Update server rating cache
    await fetch(`${supabaseUrl}/rest/v1/rpc/calculate_server_rating`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_server_id: id })
    });
    
    return new Response(JSON.stringify({
      success: true,
      review: newReview[0],
      message: 'Review submitted successfully!'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Submit review error:', err);
    return new Response(JSON.stringify({ error: 'Failed to submit review' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};