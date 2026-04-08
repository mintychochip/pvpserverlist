import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Rate limiting storage (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 edits per minute

// Check rate limit
function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `edit_${identifier}`;
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetAt) {
    // New window
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count, resetAt: record.resetAt };
}

// Verify ownership
async function verifyOwnership(
  supabaseUrl: string, 
  supabaseKey: string, 
  serverId: string, 
  ownerEmail?: string
): Promise<{ verified: boolean; server?: any; error?: string }> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(serverId)}&select=id,name,verified_owner,verification_id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!response.ok) {
      return { verified: false, error: 'Failed to verify ownership' };
    }
    
    const servers = await response.json();
    if (!servers || servers.length === 0) {
      return { verified: false, error: 'Server not found' };
    }
    
    const server = servers[0];
    
    // If no verified owner yet, allow edit (first-time setup)
    if (!server.verified_owner) {
      return { verified: true, server };
    }
    
    // Check if the requesting user is the verified owner
    // In production, this would use session/JWT auth
    // For now, we accept an owner_email parameter for verification
    if (ownerEmail && server.verified_owner === ownerEmail) {
      return { verified: true, server };
    }
    
    // Check if there's a valid verification in progress
    if (server.verification_id) {
      const verifyResponse = await fetch(
        `${supabaseUrl}/rest/v1/server_verifications?id=eq.${server.verification_id}&status=eq.verified`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          }
        }
      );
      
      if (verifyResponse.ok) {
        const verifications = await verifyResponse.json();
        if (verifications && verifications.length > 0) {
          const verification = verifications[0];
          if (!ownerEmail || verification.owner_email === ownerEmail) {
            return { verified: true, server };
          }
        }
      }
    }
    
    return { verified: false, error: 'Unauthorized: Only the verified owner can edit this server' };
    
  } catch (err) {
    return { verified: false, error: 'Failed to verify ownership' };
  }
}

// GET /api/servers/[id]/edit - Get server data for editing (with auth check)
export const GET: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || 
              (locals as any)?.env || 
              (globalThis as any)?.env || 
              {};
  
  const { id } = params;
  const url = new URL(request.url);
  const ownerEmail = url.searchParams.get('owner_email');
  
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
  
  // Verify ownership
  const ownership = await verifyOwnership(supabaseUrl, supabaseKey, id, ownerEmail || undefined);
  
  if (!ownership.verified) {
    return new Response(JSON.stringify({ error: ownership.error || 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Fetch full server data
    const response = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch server');
    }
    
    const servers = await response.json();
    if (!servers || servers.length === 0) {
      return new Response(JSON.stringify({ error: 'Server not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const server = servers[0];
    
    return new Response(JSON.stringify({
      editable: true,
      server: {
        id: server.id,
        name: server.name,
        ip: server.ip,
        port: server.port,
        website: server.website,
        description: server.description,
        tags: server.tags,
        votifier_key: server.votifier_key,
        discord_webhook: server.discord_webhook,
        verified_owner: server.verified_owner,
        verified_at: server.verified_at
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Edit fetch error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch server data' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// POST /api/servers/[id]/edit - Save server edits
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
    const { owner_email, ...editData } = body;
    
    // Rate limiting
    const rateLimitKey = owner_email || id;
    const rateLimit = checkRateLimit(rateLimitKey);
    
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Please wait before making more edits.',
        retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(rateLimit.resetAt / 1000).toString()
        }
      });
    }
    
    // Verify ownership
    const ownership = await verifyOwnership(supabaseUrl, supabaseKey, id, owner_email);
    
    if (!ownership.verified) {
      return new Response(JSON.stringify({ error: ownership.error || 'Unauthorized' }), {
        status: 403,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': rateLimit.remaining.toString()
        }
      });
    }
    
    // Validate input
    const validationErrors: string[] = [];
    
    if (editData.name !== undefined) {
      if (!editData.name || editData.name.trim().length < 2) {
        validationErrors.push('Server name must be at least 2 characters');
      }
      if (editData.name && editData.name.length > 100) {
        validationErrors.push('Server name must be less than 100 characters');
      }
    }
    
    if (editData.description !== undefined && editData.description.length > 2000) {
      validationErrors.push('Description must be less than 2000 characters');
    }
    
    if (editData.website !== undefined && editData.website) {
      try {
        new URL(editData.website);
      } catch {
        validationErrors.push('Invalid website URL');
      }
    }
    
    if (editData.discord_webhook !== undefined && editData.discord_webhook) {
      if (!editData.discord_webhook.startsWith('https://discord.com/api/webhooks/')) {
        validationErrors.push('Invalid Discord webhook URL');
      }
    }
    
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validationErrors }), {
        status: 400,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': rateLimit.remaining.toString()
        }
      });
    }
    
    // Prepare updates
    const updates: any = {};
    
    if (editData.name !== undefined) updates.name = editData.name.trim();
    if (editData.website !== undefined) updates.website = editData.website || null;
    if (editData.description !== undefined) updates.description = editData.description.trim() || null;
    if (editData.tags !== undefined) {
      updates.tags = Array.isArray(editData.tags) 
        ? editData.tags 
        : editData.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    if (editData.votifier_key !== undefined) updates.votifier_key = editData.votifier_key || null;
    if (editData.discord_webhook !== undefined) updates.discord_webhook = editData.discord_webhook || null;
    
    updates.updated_at = new Date().toISOString();
    
    // Store old values for audit log
    const oldServer = ownership.server;
    const changes: any = {};
    Object.keys(updates).forEach(key => {
      if (key !== 'updated_at' && JSON.stringify(oldServer[key]) !== JSON.stringify(updates[key])) {
        changes[key] = { from: oldServer[key], to: updates[key] };
      }
    });
    
    // Update server
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updates)
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update server: ${errorText}`);
    }
    
    const updatedServers = await updateResponse.json();
    
    // Create audit log entry
    if (Object.keys(changes).length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          server_id: id,
          action: 'server_updated',
          actor: owner_email || 'anonymous',
          details: {
            changes: changes,
            timestamp: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        })
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Server updated successfully',
      server: updatedServers[0],
      changes_made: Object.keys(changes),
      rate_limit: {
        remaining: rateLimit.remaining,
        reset_at: new Date(rateLimit.resetAt).toISOString()
      }
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': rateLimit.remaining.toString()
      }
    });
    
  } catch (err: any) {
    console.error('Edit save error:', err);
    return new Response(JSON.stringify({ error: 'Failed to save changes' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// OPTIONS handler
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};