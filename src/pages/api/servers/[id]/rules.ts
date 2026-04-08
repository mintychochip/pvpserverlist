/**
 * Server Rules API
 * GET    /api/servers/[id]/rules - Get rules for a server
 * POST   /api/servers/[id]/rules - Create/update rules (owner only)
 * PUT    /api/servers/[id]/rules - Update rules (owner only)
 * DELETE /api/servers/[id]/rules - Delete rules (owner only)
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';

// Helper to get auth token from request
function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Helper to verify server ownership
async function verifyOwnership(serverId: string, token: string): Promise<boolean> {
  try {
    // Get current user
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!userRes.ok) return false;
    const user = await userRes.json();
    
    // Check if user owns the server
    const serverRes = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&owner_id=eq.${user.id}&select=id`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!serverRes.ok) return false;
    const servers = await serverRes.json();
    return servers.length > 0;
  } catch (err) {
    console.error('Ownership verification error:', err);
    return false;
  }
}

const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweHV0c2RiaWFtcG54ZmdrandxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTEwMDQsImV4cCI6MjA5MDkyNzAwNH0.35hrTSgxQnICpLOY3g6W3eNxxe7DKCc3q165tyb0Ieo';

// GET - Fetch rules for a server
export const GET: APIRoute = async ({ params, locals }) => {
  const { id: serverId } = params;
  const env = (locals as any)?.runtime?.env || {};
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/server_rules?server_id=eq.${serverId}&select=*`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch rules');
    }

    const rules = await response.json();
    
    if (rules.length === 0) {
      return new Response(JSON.stringify({ 
        exists: false,
        content: '',
        server_id: serverId 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      exists: true,
      ...rules[0]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Get rules error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to fetch rules' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST - Create or upsert rules (owner only)
export const POST: APIRoute = async ({ request, params, locals }) => {
  const { id: serverId } = params;
  const token = getAuthToken(request);
  const env = (locals as any)?.runtime?.env || {};
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { content } = body;

    if (typeof content !== 'string') {
      return new Response(JSON.stringify({ error: 'Content must be a string' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (content.length > 50000) {
      return new Response(JSON.stringify({ error: 'Content too long (max 50,000 characters)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if rules already exist
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/server_rules?server_id=eq.${serverId}&select=id`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const existing = await existingRes.json();
    
    let response;
    
    if (existing.length > 0) {
      // Update existing
      response = await fetch(
        `${supabaseUrl}/rest/v1/server_rules?server_id=eq.${serverId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ content, updated_at: new Date().toISOString() })
        }
      );
    } else {
      // Create new
      response = await fetch(
        `${supabaseUrl}/rest/v1/server_rules`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ server_id: serverId, content })
        }
      );
    }

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: 'Not authorized to modify rules for this server' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(error);
    }

    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      rules: result[0] || result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Post rules error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to save rules' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// PUT - Update rules (owner only, alias for POST)
export const PUT: APIRoute = async (context) => {
  return POST(context);
};

// DELETE - Delete rules (owner only)
export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const { id: serverId } = params;
  const token = getAuthToken(request);
  const env = (locals as any)?.runtime?.env || {};
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/server_rules?server_id=eq.${serverId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: 'Not authorized to delete rules for this server' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error('Failed to delete rules');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Rules deleted successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Delete rules error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to delete rules' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS - CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
