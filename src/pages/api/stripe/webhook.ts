// Stripe Webhook API - Handle subscription lifecycle events
import type { APIRoute } from 'astro';
import Stripe from 'stripe';

// Store processed event IDs to prevent duplicates (in-memory cache)
const processedEvents = new Set<string>();
const MAX_CACHE_SIZE = 1000;

export const POST: APIRoute = async ({ request }) => {
  const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!stripeSecretKey || !webhookSecret) {
    console.error('Stripe webhook not configured');
    return new Response(
      JSON.stringify({ error: 'Webhook not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const payload = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return new Response(
      JSON.stringify({ error: 'Missing stripe-signature header' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
  });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(
      JSON.stringify({ error: `Webhook Error: ${err.message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Deduplication check
  if (processedEvents.has(event.id)) {
    console.log(`Event ${event.id} already processed, skipping`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  // Add to processed set
  processedEvents.add(event.id);
  if (processedEvents.size > MAX_CACHE_SIZE) {
    const firstItem = processedEvents.values().next().value;
    if (firstItem) processedEvents.delete(firstItem);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, supabaseUrl, supabaseKey);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice, supabaseUrl, supabaseKey);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice, supabaseUrl, supabaseKey);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription, supabaseUrl, supabaseKey);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription, supabaseUrl, supabaseKey);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err: any) {
    console.error(`Error processing webhook ${event.type}:`, err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to process webhook' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabaseUrl: string,
  supabaseKey: string
) {
  const serverId = session.metadata?.server_id;
  const tier = session.metadata?.tier;

  if (!serverId || !tier) {
    console.error('Missing server_id or tier in session metadata');
    return;
  }

  const stripeCustomerId = session.customer as string;
  const stripeSubscriptionId = session.subscription as string;

  // Update server with subscription info
  const featuredUntil = new Date();
  featuredUntil.setMonth(featuredUntil.getMonth() + 1); // 1 month from now

  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        tier: tier,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        premium_since: new Date().toISOString(),
        featured_until: featuredUntil.toISOString(),
      })
    }
  );

  if (!updateResponse.ok) {
    throw new Error(`Failed to update server: ${updateResponse.status}`);
  }

  // Create subscription record
  const subscriptionResponse = await fetch(
    `${supabaseUrl}/rest/v1/premium_subscriptions`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        server_id: serverId,
        tier: tier,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status: 'active',
        started_at: new Date().toISOString(),
        ends_at: featuredUntil.toISOString(),
      })
    }
  );

  if (!subscriptionResponse.ok) {
    console.error('Failed to create subscription record:', await subscriptionResponse.text());
  }

  console.log(`Server ${serverId} upgraded to ${tier}`);
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabaseUrl: string,
  supabaseKey: string
) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Find server by subscription ID
  const response = await fetch(
    `${supabaseUrl}/rest/v1/servers?stripe_subscription_id=eq.${subscriptionId}&select=id,featured_until`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }
  );

  if (!response.ok) return;

  const servers = await response.json();
  if (!servers || servers.length === 0) return;

  const server = servers[0];

  // Extend featured_until by 1 month from current expiration or now
  const currentExpiry = server.featured_until ? new Date(server.featured_until) : new Date();
  const newExpiry = currentExpiry > new Date() ? currentExpiry : new Date();
  newExpiry.setMonth(newExpiry.getMonth() + 1);

  await fetch(
    `${supabaseUrl}/rest/v1/servers?id=eq.${server.id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        featured_until: newExpiry.toISOString(),
      })
    }
  );

  // Update subscription record
  await fetch(
    `${supabaseUrl}/rest/v1/premium_subscriptions?stripe_subscription_id=eq.${subscriptionId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'active',
        ends_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  );

  console.log(`Payment succeeded for subscription ${subscriptionId}, extended until ${newExpiry}`);
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  supabaseUrl: string,
  supabaseKey: string
) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  // Update subscription status to past_due
  await fetch(
    `${supabaseUrl}/rest/v1/premium_subscriptions?stripe_subscription_id=eq.${subscriptionId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      })
    }
  );

  console.log(`Payment failed for subscription ${subscriptionId}`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabaseUrl: string,
  supabaseKey: string
) {
  const subscriptionId = subscription.id;
  const status = subscription.status;

  // Map Stripe status to our status
  const statusMap: Record<string, string> = {
    'active': 'active',
    'canceled': 'cancelled',
    'incomplete': 'active',
    'incomplete_expired': 'expired',
    'past_due': 'past_due',
    'paused': 'cancelled',
    'trialing': 'active',
    'unpaid': 'past_due',
  };

  const mappedStatus = statusMap[status] || status;

  await fetch(
    `${supabaseUrl}/rest/v1/premium_subscriptions?stripe_subscription_id=eq.${subscriptionId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      })
    }
  );

  console.log(`Subscription ${subscriptionId} updated to status: ${mappedStatus}`);
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabaseUrl: string,
  supabaseKey: string
) {
  const subscriptionId = subscription.id;

  // Find the server
  const response = await fetch(
    `${supabaseUrl}/rest/v1/servers?stripe_subscription_id=eq.${subscriptionId}&select=id`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    }
  );

  if (!response.ok) return;

  const servers = await response.json();
  if (!servers || servers.length === 0) return;

  const server = servers[0];

  // Downgrade server to free
  await fetch(
    `${supabaseUrl}/rest/v1/servers?id=eq.${server.id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        tier: 'free',
        featured_until: null,
        stripe_subscription_id: null,
      })
    }
  );

  // Update subscription record
  await fetch(
    `${supabaseUrl}/rest/v1/premium_subscriptions?stripe_subscription_id=eq.${subscriptionId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  );

  console.log(`Subscription ${subscriptionId} cancelled, server downgraded to free`);
}
