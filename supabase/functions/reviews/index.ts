// Server Reviews API
// Submit and fetch reviews with moderation

import { createClient } from 'npm:@supabase/supabase-js';

export async function handleReviews(request: Request): Promise<Response> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const url = new URL(request.url);
  const serverId = url.searchParams.get('serverId');
  
  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Missing serverId' }), { headers, status: 400 });
  }
  
  // GET - Fetch reviews
  if (request.method === 'GET') {
    try {
      const { data: reviews, error } = await supabase
        .from('server_reviews')
        .select('*')
        .eq('server_id', serverId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      // Get rating stats
      const { data: stats } = await supabase
        .from('server_rating_stats')
        .select('*')
        .eq('server_id', serverId)
        .single();
      
      // Get distribution
      const { data: distribution } = await supabase
        .rpc('get_review_distribution', { server_uuid: serverId });
      
      return new Response(JSON.stringify({
        reviews: reviews || [],
        stats: stats || { total_reviews: 0, avg_rating: 0 },
        distribution: distribution || []
      }), { headers });
      
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers, status: 500 });
    }
  }
  
  // POST - Submit review
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { username, rating, title, content, playtime_hours } = body;
      
      // Validation
      if (!username || !rating || !content) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { headers, status: 400 });
      }
      
      if (rating < 1 || rating > 5) {
        return new Response(JSON.stringify({ error: 'Rating must be 1-5' }), { headers, status: 400 });
      }
      
      if (content.length < 10 || content.length > 1000) {
        return new Response(JSON.stringify({ error: 'Review must be 10-1000 characters' }), { headers, status: 400 });
      }
      
      // Check if user has already reviewed this server
      const { data: existing } = await supabase
        .from('server_reviews')
        .select('id')
        .eq('server_id', serverId)
        .eq('username', username.toLowerCase())
        .limit(1);
      
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ error: 'You already reviewed this server' }), { headers, status: 409 });
      }
      
      // Check if user has voted (for verified badge)
      const { data: votes } = await supabase
        .from('votes')
        .select('id')
        .eq('server_id', serverId)
        .eq('username', username.toLowerCase())
        .limit(1);
      
      // Insert review
      const { data: review, error } = await supabase
        .from('server_reviews')
        .insert([{
          server_id: serverId,
          username: username.toLowerCase(),
          rating,
          title: title || null,
          content,
          playtime_hours: playtime_hours || null,
          is_verified: votes && votes.length > 0,
          ip_address: request.headers.get('x-forwarded-for') || 'unknown',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      return new Response(JSON.stringify({
        success: true,
        review,
        message: 'Review submitted successfully'
      }), { headers, status: 201 });
      
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers, status: 500 });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers, status: 405 });
}

if (typeof Deno !== 'undefined') {
  Deno.serve(handleReviews);
}
