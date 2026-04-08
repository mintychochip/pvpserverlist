import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Valid post categories
const VALID_CATEGORIES = ['news', 'update', 'patch', 'event', 'announcement', 'other'];

// GET /api/servers/[id]/posts - Get posts for a server
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
  
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const category = url.searchParams.get('category');
  const includeUnpublished = url.searchParams.get('include_unpublished') === 'true';
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Build query - get posts with server info for public feed
    let query = `${supabaseUrl}/rest/v1/server_posts?server_id=eq.${encodeURIComponent(id)}`;
    
    // Only show published posts to public
    if (!includeUnpublished) {
      query += '&is_published=eq.true';
    }
    
    // Filter by category if provided
    if (category && VALID_CATEGORIES.includes(category)) {
      query += `&category=eq.${encodeURIComponent(category)}`;
    }
    
    // Order: pinned first, then by published_at desc
    query += '&order=is_pinned.desc, published_at.desc';
    query += `&limit=${limit}&offset=${offset}`;
    
    const response = await fetch(query, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch posts');
    }
    
    const posts = await response.json();
    
    // Get server info
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=name,icon`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const serverData = await serverResponse.json();
    const server = serverData?.[0];
    
    return new Response(JSON.stringify({
      posts: posts || [],
      server: server || null,
      pagination: {
        limit,
        offset,
        has_more: (posts || []).length === limit
      }
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': includeUnpublished ? 'no-cache' : 'max-age=60'
      }
    });
    
  } catch (err: any) {
    console.error('Get posts error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch posts' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/servers/[id]/posts - Create a new post
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
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body = await request.json();
    const { 
      title, 
      content, 
      summary,
      author,
      category = 'news',
      is_pinned = false,
      is_published = true,
      published_at
    } = body;
    
    // Validation
    if (!title || !content) {
      return new Response(JSON.stringify({ error: 'Title and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (title.length < 3 || title.length > 200) {
      return new Response(JSON.stringify({ error: 'Title must be between 3 and 200 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (content.length < 10) {
      return new Response(JSON.stringify({ error: 'Content must be at least 10 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (summary && summary.length > 500) {
      return new Response(JSON.stringify({ error: 'Summary must be at most 500 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!VALID_CATEGORIES.includes(category)) {
      return new Response(JSON.stringify({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify server exists
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const servers = await serverResponse.json();
    if (!servers || servers.length === 0) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create post
    const postData = {
      server_id: id,
      title: title.trim(),
      content: content.trim(),
      summary: summary?.trim() || null,
      author: author?.trim() || 'Server Admin',
      category,
      is_pinned: Boolean(is_pinned),
      is_published: Boolean(is_published),
      published_at: published_at || new Date().toISOString()
    };
    
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/server_posts`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(postData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Create post error:', errorText);
      throw new Error('Failed to create post');
    }
    
    const newPost = await createResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      post: newPost[0],
      message: 'Post created successfully!'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Create post error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create post' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// DELETE /api/servers/[id]/posts - Delete a post
export const DELETE: APIRoute = async ({ params, url, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  const postId = url.searchParams.get('post_id');
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  if (!postId) {
    return new Response(JSON.stringify({ error: 'Post ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Verify post belongs to this server
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_posts?id=eq.${encodeURIComponent(postId)}&server_id=eq.${encodeURIComponent(id)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const posts = await checkResponse.json();
    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Delete the post
    const deleteResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_posts?id=eq.${encodeURIComponent(postId)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!deleteResponse.ok) {
      throw new Error('Failed to delete post');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Post deleted successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Delete post error:', err);
    return new Response(JSON.stringify({ error: 'Failed to delete post' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// PATCH /api/servers/[id]/posts - Update a post
export const PATCH: APIRoute = async ({ params, request, locals }) => {
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
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body = await request.json();
    const { post_id, ...updates } = body;
    
    if (!post_id) {
      return new Response(JSON.stringify({ error: 'Post ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate category if provided
    if (updates.category && !VALID_CATEGORIES.includes(updates.category)) {
      return new Response(JSON.stringify({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate title if provided
    if (updates.title && (updates.title.length < 3 || updates.title.length > 200)) {
      return new Response(JSON.stringify({ error: 'Title must be between 3 and 200 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify post belongs to this server
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_posts?id=eq.${encodeURIComponent(post_id)}&server_id=eq.${encodeURIComponent(id)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const posts = await checkResponse.json();
    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Update the post
    const updateData: any = {};
    if (updates.title !== undefined) updateData.title = updates.title.trim();
    if (updates.content !== undefined) updateData.content = updates.content.trim();
    if (updates.summary !== undefined) updateData.summary = updates.summary?.trim() || null;
    if (updates.author !== undefined) updateData.author = updates.author.trim();
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.is_pinned !== undefined) updateData.is_pinned = Boolean(updates.is_pinned);
    if (updates.is_published !== undefined) updateData.is_published = Boolean(updates.is_published);
    if (updates.published_at !== undefined) updateData.published_at = updates.published_at;
    
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_posts?id=eq.${encodeURIComponent(post_id)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Update post error:', errorText);
      throw new Error('Failed to update post');
    }
    
    const updatedPost = await updateResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      post: updatedPost[0],
      message: 'Post updated successfully!'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Update post error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update post' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};