// Stripe Checkout API - Create checkout sessions for premium upgrades
import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const POST: APIRoute = async ({ request }) => {
  const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  
  if (!stripeSecretKey) {
    return new Response(
      JSON.stringify({ error: 'Stripe not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { serverId, tier, email, successUrl, cancelUrl } = body;

    // Validate required fields
    if (!serverId || !tier || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: serverId, tier, email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate tier
    if (!['premium', 'elite'].includes(tier)) {
      return new Response(
        JSON.stringify({ error: 'Invalid tier. Must be premium or elite' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify server exists
    const serverCheck = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}&select=id,name,owner_id,stripe_customer_id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    if (!serverCheck.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to verify server' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const servers = await serverCheck.json();
    if (!servers || servers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Server not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const server = servers[0];

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    // Define price IDs based on tier
    // These should be created in Stripe Dashboard and stored as env vars
    const priceIds: Record<string, string> = {
      premium: import.meta.env.STRIPE_PRICE_PREMIUM || 'price_placeholder_premium',
      elite: import.meta.env.STRIPE_PRICE_ELITE || 'price_placeholder_elite',
    };

    const priceId = priceIds[tier];
    if (!priceId || priceId.includes('placeholder')) {
      return new Response(
        JSON.stringify({ 
          error: 'Stripe price not configured. Please set STRIPE_PRICE_PREMIUM and STRIPE_PRICE_ELITE environment variables.',
          setupRequired: true
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create or retrieve customer
    let customerId = server.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          server_id: serverId,
          server_name: server.name,
        },
      });
      customerId = customer.id;

      // Store customer ID in Supabase
      await fetch(
        `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ stripe_customer_id: customerId })
        }
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          server_id: serverId,
          tier: tier,
        },
      },
      success_url: successUrl || `${request.headers.get('origin')}/dashboard?upgrade=success`,
      cancel_url: cancelUrl || `${request.headers.get('origin')}/premium?upgrade=canceled`,
      metadata: {
        server_id: serverId,
        tier: tier,
      },
    });

    return new Response(
      JSON.stringify({ 
        url: session.url,
        sessionId: session.id,
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );

  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to create checkout session' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// Handle OPTIONS for CORS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
