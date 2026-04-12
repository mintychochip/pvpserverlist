// API endpoint for featured/promoted servers
// Returns elite and premium tier servers for homepage spotlight

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get limit from query params, default to 6
  const limit = parseInt(url.searchParams.get('limit') || '6', 10);
  const maxLimit = 20;
  
  if (limit < 1 || limit > maxLimit) {
    return new Response(
      JSON.stringify({ error: `Limit must be between 1 and ${maxLimit}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Fetch featured servers using the database function
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_featured_servers`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit_count: limit })
      }
    );

    if (!response.ok) {
      // Fallback: query servers directly if RPC fails
      const fallbackResponse = await fetch(
        `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,tier,vote_count,players_online,max_players,status,description,tags,version,banner_url,icon_url&status=eq.online&or=(tier.eq.elite,and(tier.eq.premium,featured_until.gt.${new Date().toISOString()}))&order=tier.desc,vote_count.desc&limit=${limit}`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      
      if (!fallbackResponse.ok) {
        throw new Error(`Supabase error: ${fallbackResponse.status}`);
      }
      
      const servers = await fallbackResponse.json();
      
      // If no featured servers, return top voted online servers as fallback
      if (!servers || servers.length === 0) {
        const topServersResponse = await fetch(
          `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,tier,vote_count,players_online,max_players,status,description,tags,version,banner_url,icon_url&status=eq.online&order=vote_count.desc,players_online.desc&limit=${limit}`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            }
          }
        );
        
        const topServers = await topServersResponse.json();
        return new Response(
          JSON.stringify({ 
            servers: topServers || [],
            is_fallback: true,
            message: 'No featured servers available - showing top voted servers'
          }),
          { 
            status: 200, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            } 
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          servers,
          is_fallback: false 
        }),
        { 
          status: 200, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }

    const featuredServers = await response.json();
    
    // Enrich with full server data
    if (featuredServers && featuredServers.length > 0) {
      const serverIds = featuredServers.map((s: any) => s.id);
      const idsParam = serverIds.map((id: string) => `id.eq.${id}`).join(',');
      
      const detailsResponse = await fetch(
        `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,tier,vote_count,players_online,max_players,status,description,tags,version,banner_url,icon_url&or=(${idsParam})`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      
      if (detailsResponse.ok) {
        const fullServers = await detailsResponse.json();
        // Preserve the featured order
        const orderedServers = featuredServers.map((featured: any) => {
          const full = fullServers.find((s: any) => s.id === featured.id);
          return full || featured;
        }).filter(Boolean);
        
        return new Response(
          JSON.stringify({ 
            servers: orderedServers,
            is_fallback: false,
            featured_count: orderedServers.length
          }),
          { 
            status: 200, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=300' // 5 minute cache
            } 
          }
        );
      }
    }
    
    // If no featured servers, return fallback
    const fallbackResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?select=id,name,ip,port,tier,vote_count,players_online,max_players,status,description,tags,version,banner_url,icon_url&status=eq.online&order=vote_count.desc,players_online.desc&limit=${limit}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    const fallbackServers = await fallbackResponse.json();
    
    return new Response(
      JSON.stringify({ 
        servers: fallbackServers || [],
        is_fallback: true,
        message: 'No featured servers available - showing top voted servers'
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
    
  } catch (err) {
    console.error('Featured servers API error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to fetch featured servers' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
