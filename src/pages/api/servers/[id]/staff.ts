import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Valid staff roles
const VALID_ROLES = ['owner', 'admin', 'moderator', 'helper', 'developer', 'builder', 'content_creator'];

// GET /api/servers/[id]/staff - Get staff members for a server
export const GET: APIRoute = async ({ params, locals }) => {
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
    // Fetch staff members sorted by role priority and sort_order
    const response = await fetch(
      `${supabaseUrl}/rest/v1/staff_members?server_id=eq.${encodeURIComponent(id)}&is_active=eq.true&order=sort_order.asc,role.asc,created_at.desc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch staff members');
    }
    
    const staff = await response.json();
    
    // Enrich with Minecraft avatar URLs
    const staffWithAvatars = (staff || []).map((member: any) => ({
      ...member,
      avatar_url: member.avatar_url || `https://mc-heads.net/avatar/${encodeURIComponent(member.minecraft_username)}/64`,
      head_url: `https://mc-heads.net/head/${encodeURIComponent(member.minecraft_username)}/64`,
      body_url: `https://mc-heads.net/player/${encodeURIComponent(member.minecraft_username)}/128`
    }));
    
    // Group by role for easier display
    const groupedByRole: Record<string, any[]> = {};
    const roleOrder = ['owner', 'admin', 'developer', 'moderator', 'helper', 'builder', 'content_creator'];
    
    roleOrder.forEach(role => groupedByRole[role] = []);
    
    staffWithAvatars.forEach((member: any) => {
      if (!groupedByRole[member.role]) {
        groupedByRole[member.role] = [];
      }
      groupedByRole[member.role].push(member);
    });
    
    // Remove empty roles
    Object.keys(groupedByRole).forEach(role => {
      if (groupedByRole[role].length === 0) {
        delete groupedByRole[role];
      }
    });
    
    return new Response(JSON.stringify({
      staff: staffWithAvatars,
      grouped_by_role: groupedByRole,
      total_count: staffWithAvatars.length,
      role_order: roleOrder
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300' // Cache for 5 minutes
      }
    });
    
  } catch (err: any) {
    console.error('Get staff error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch staff members' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/servers/[id]/staff - Add a staff member
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
      role, 
      display_name, 
      bio,
      avatar_url,
      discord_username,
      sort_order,
      owner_email // For verification (temporary until proper auth)
    } = body;
    
    // Validation
    if (!minecraft_username) {
      return new Response(JSON.stringify({ error: 'Minecraft username is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate Minecraft username format
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraft_username)) {
      return new Response(JSON.stringify({ error: 'Invalid Minecraft username (3-16 chars, letters/numbers/underscores)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate role
    if (!role || !VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate bio length
    if (bio && bio.length > 500) {
      return new Response(JSON.stringify({ error: 'Bio must be 500 characters or less' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify server ownership (temporary - check owner_email)
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=id,owner_email`,
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
    
    // Check if user is the owner (simplified auth)
    if (owner_email && server.owner_email !== owner_email) {
      return new Response(JSON.stringify({ error: 'Unauthorized - you must be the server owner' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check for existing staff member
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/staff_members?server_id=eq.${encodeURIComponent(id)}&minecraft_username=eq.${encodeURIComponent(minecraft_username.toLowerCase())}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const existing = await existingResponse.json();
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: 'This user is already a staff member. Remove them first to update.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get current max sort_order for this server
    const sortResponse = await fetch(
      `${supabaseUrl}/rest/v1/staff_members?server_id=eq.${encodeURIComponent(id)}&select=sort_order&order=sort_order.desc&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    const sortData = await sortResponse.json();
    const nextSortOrder = sortData?.[0]?.sort_order !== undefined ? sortData[0].sort_order + 1 : 0;
    
    // Create staff member
    const staffData = {
      server_id: id,
      minecraft_username: minecraft_username.toLowerCase().trim(),
      role: role,
      display_name: display_name?.trim() || null,
      bio: bio?.trim() || null,
      avatar_url: avatar_url?.trim() || null,
      discord_username: discord_username?.trim() || null,
      is_active: true,
      sort_order: sort_order !== undefined ? sort_order : nextSortOrder,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/staff_members`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(staffData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create staff member: ${errorText}`);
    }
    
    const newStaff = await createResponse.json();
    const member = newStaff[0];
    
    return new Response(JSON.stringify({
      success: true,
      staff_member: {
        ...member,
        avatar_url: member.avatar_url || `https://mc-heads.net/avatar/${encodeURIComponent(member.minecraft_username)}/64`,
        head_url: `https://mc-heads.net/head/${encodeURIComponent(member.minecraft_username)}/64`,
        body_url: `https://mc-heads.net/player/${encodeURIComponent(member.minecraft_username)}/128`
      },
      message: 'Staff member added successfully!'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Add staff error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to add staff member' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// DELETE /api/servers/[id]/staff - Remove a staff member
export const DELETE: APIRoute = async ({ params, request, locals }) => {
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
    const { staff_id, minecraft_username, owner_email } = body;
    
    if (!staff_id && !minecraft_username) {
      return new Response(JSON.stringify({ error: 'Staff ID or Minecraft username is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify server ownership (temporary - check owner_email)
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=id,owner_email`,
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
    
    // Check if user is the owner (simplified auth)
    if (owner_email && server.owner_email !== owner_email) {
      return new Response(JSON.stringify({ error: 'Unauthorized - you must be the server owner' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Build delete query
    let deleteQuery = `${supabaseUrl}/rest/v1/staff_members?server_id=eq.${encodeURIComponent(id)}`;
    
    if (staff_id) {
      deleteQuery += `&id=eq.${encodeURIComponent(staff_id)}`;
    } else {
      deleteQuery += `&minecraft_username=eq.${encodeURIComponent(minecraft_username!.toLowerCase())}`;
    }
    
    const deleteResponse = await fetch(deleteQuery, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });
    
    if (!deleteResponse.ok) {
      throw new Error('Failed to remove staff member');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Staff member removed successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Remove staff error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to remove staff member' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
