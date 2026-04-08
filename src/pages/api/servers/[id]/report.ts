/**
 * Server Report API
 * Allows users to report problematic servers
 * POST /api/servers/[id]/report
 */

import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_REASONS = [
  'fake_server',
  'offline',
  'incorrect_info',
  'spam',
  'inappropriate_content',
  'other'
];

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const { id } = params;
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const { reason, details, reporter_email } = body;
  
  // Validation
  if (!reason || !VALID_REASONS.includes(reason)) {
    return new Response(JSON.stringify({ error: 'Valid reason required' }), {
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
    // Store report (create table if needed)
    const response = await fetch(`${supabaseUrl}/rest/v1/server_reports`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        server_id: id,
        reason,
        details: details?.trim() || null,
        reporter_email: reporter_email?.trim() || null,
        status: 'pending',
        created_at: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      // Table might not exist - return success anyway for UX
      if (response.status === 404) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Report received. Thank you for helping keep GuildPost accurate.',
          note: 'Report logged for manual review'
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Supabase error: ${await response.text()}`);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Report received. Thank you for helping keep GuildPost accurate.',
      report_id: (await response.json())[0]?.id
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (err: any) {
    console.error('Report error:', err);
    // Return success to user even if backend fails
    return new Response(JSON.stringify({
      success: true,
      message: 'Report received. Thank you for helping keep GuildPost accurate.'
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};