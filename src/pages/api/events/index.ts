import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// GET /api/events - List upcoming events
export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseKey) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const category = url.searchParams.get('category');
  const serverId = url.searchParams.get('server_id');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  try {
    let queryUrl = `${supabaseUrl}/rest/v1/server_events?select=*,servers(name,ip,port,icon)&start_time=gte.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&order=start_time.asc&limit=${limit}&offset=${offset}`;
    
    if (category && category !== 'all') {
      queryUrl += `&category=eq.${encodeURIComponent(category)}`;
    }
    
    if (serverId) {
      queryUrl += `&server_id=eq.${encodeURIComponent(serverId)}`;
    }
    
    const response = await fetch(queryUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }
    
    const events = await response.json();
    
    return new Response(JSON.stringify({
      events: events || [],
      count: events?.length || 0,
      category: category || 'all'
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
    
  } catch (err: any) {
    console.error('Events API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch events' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/events - Create new event
export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
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
    const { server_id, title, description, category, start_time, end_time, prizes, owner_email } = body;
    
    // Validation
    if (!server_id || !title || !category || !start_time) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: server_id, title, category, start_time' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (title.length < 3 || title.length > 100) {
      return new Response(JSON.stringify({ 
        error: 'Title must be between 3 and 100 characters' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const validCategories = ['tournament', 'drop', 'update', 'pvp', 'building', 'social', 'other'];
    if (!validCategories.includes(category)) {
      return new Response(JSON.stringify({ 
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify server ownership
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(server_id)}&select=id,name,verified_owner,tier`,
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
    
    const server = servers[0];
    
    // Check ownership (if verified)
    if (server.verified_owner && server.verified_owner !== owner_email) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Only the server owner can create events' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check rate limit (max 5 events per server per week)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const countResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_events?server_id=eq.${encodeURIComponent(server_id)}&created_at=gte.${weekAgo}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const recentEvents = await countResponse.json();
    if (recentEvents && recentEvents.length >= 5) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit: Maximum 5 events per server per week' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check start time is in future
    if (new Date(start_time) < new Date()) {
      return new Response(JSON.stringify({ 
        error: 'Start time must be in the future' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create event
    const eventData = {
      server_id,
      title: title.trim(),
      description: description?.trim() || null,
      category,
      start_time,
      end_time: end_time || null,
      prizes: prizes?.trim() || null,
      featured: server.tier === 'elite', // Elite servers get auto-featured
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/server_events`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(eventData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create event: ${errorText}`);
    }
    
    const createdEvents = await createResponse.json();
    
    // Create audit log
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        server_id: server_id,
        action: 'event_created',
        actor: owner_email || 'anonymous',
        details: { event_id: createdEvents[0]?.id, title, category },
        created_at: new Date().toISOString()
      })
    });
    
    return new Response(JSON.stringify({
      success: true,
      event: createdEvents[0],
      message: 'Event created successfully'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Create event error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create event' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
