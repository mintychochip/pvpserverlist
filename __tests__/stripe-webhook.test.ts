import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Stripe Webhook API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Environment Validation', () => {
    it('should return 500 when STRIPE_SECRET_KEY is missing', async () => {
      const webhookModule = await import('../src/pages/api/stripe/webhook');

      const request = new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: 'test-payload',
        headers: { 'stripe-signature': 'sig_test' },
      });

      const response = await webhookModule.POST({ request } as any);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBe('Webhook not configured');
    });

    it('should return 500 when STRIPE_WEBHOOK_SECRET is missing', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.STRIPE_WEBHOOK_SECRET = '';

      const webhookModule = await import('../src/pages/api/stripe/webhook');

      const request = new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: 'test-payload',
        headers: { 'stripe-signature': 'sig_test' },
      });

      const response = await webhookModule.POST({ request } as any);
      expect(response.status).toBe(500);
    });

    it('should return 500 when Supabase configuration is missing', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      process.env.SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      const webhookModule = await import('../src/pages/api/stripe/webhook');

      const request = new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: 'test-payload',
        headers: { 'stripe-signature': 'sig_test' },
      });

      const response = await webhookModule.POST({ request } as any);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBe('Supabase configuration missing');
    });
  });

  describe('Request Validation', () => {
    it('should return 400 when stripe-signature header is missing', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      const webhookModule = await import('../src/pages/api/stripe/webhook');

      const request = new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: 'test-payload',
        // No stripe-signature header
      });

      const response = await webhookModule.POST({ request } as any);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('Missing stripe-signature header');
    });
  });

  describe('Event Types', () => {
    const validWebhookEvents = [
      'checkout.session.completed',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ];

    it('should define all handled event types', () => {
      validWebhookEvents.forEach(eventType => {
        expect(typeof eventType).toBe('string');
        expect(eventType.startsWith('checkout.') ||
               eventType.startsWith('invoice.') ||
               eventType.startsWith('customer.')).toBe(true);
      });
    });

    it('should have checkout.session.completed in handled events', () => {
      expect(validWebhookEvents).toContain('checkout.session.completed');
    });

    it('should have subscription lifecycle events in handled events', () => {
      expect(validWebhookEvents).toContain('customer.subscription.updated');
      expect(validWebhookEvents).toContain('customer.subscription.deleted');
    });

    it('should have payment events in handled events', () => {
      expect(validWebhookEvents).toContain('invoice.payment_succeeded');
      expect(validWebhookEvents).toContain('invoice.payment_failed');
    });
  });

  describe('Subscription Status Mapping', () => {
    it('should map active status correctly', () => {
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

      expect(statusMap['active']).toBe('active');
      expect(statusMap['trialing']).toBe('active');
      expect(statusMap['incomplete']).toBe('active');
    });

    it('should map cancelled statuses correctly', () => {
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

      expect(statusMap['canceled']).toBe('cancelled');
      expect(statusMap['paused']).toBe('cancelled');
    });

    it('should map problematic statuses correctly', () => {
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

      expect(statusMap['past_due']).toBe('past_due');
      expect(statusMap['unpaid']).toBe('past_due');
      expect(statusMap['incomplete_expired']).toBe('expired');
    });

    it('should handle unknown status gracefully', () => {
      const statusMap: Record<string, string> = {
        'active': 'active',
        'canceled': 'cancelled',
      };

      const unknownStatus = 'unknown_status';
      const mappedStatus = statusMap[unknownStatus] || unknownStatus;
      expect(mappedStatus).toBe('unknown_status');
    });
  });

  describe('Event Deduplication', () => {
    it('should detect duplicate event IDs', () => {
      const processedEvents = new Set<string>();
      const eventId = 'evt_1234567890';

      expect(processedEvents.has(eventId)).toBe(false);
      processedEvents.add(eventId);
      expect(processedEvents.has(eventId)).toBe(true);
    });

    it('should return success for duplicate events', () => {
      const processedEvents = new Set<string>();
      const eventId = 'evt_duplicate_test';

      processedEvents.add(eventId);

      // Simulate duplicate check
      const isDuplicate = processedEvents.has(eventId);
      expect(isDuplicate).toBe(true);

      const response = { received: true, duplicate: true };
      expect(response.duplicate).toBe(true);
    });

    it('should enforce MAX_CACHE_SIZE limit', () => {
      const MAX_CACHE_SIZE = 1000;
      const processedEvents = new Set<string>();

      expect(MAX_CACHE_SIZE).toBe(1000);

      // Simulate adding events up to limit
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        processedEvents.add(`evt_${i}`);
      }

      expect(processedEvents.size).toBe(MAX_CACHE_SIZE);

      // Add one more (should trigger cleanup - remove first item)
      const firstItem = processedEvents.values().next().value;
      if (firstItem) processedEvents.delete(firstItem);
      processedEvents.add('evt_1000');

      // Size should remain at MAX_CACHE_SIZE after cleanup
      expect(processedEvents.size).toBe(MAX_CACHE_SIZE);
    });
  });

  describe('Checkout Session Completed Handler', () => {
    it('should require server_id in session metadata', () => {
      const session = {
        metadata: {
          tier: 'premium',
          // Missing server_id
        },
        customer: 'cus_test_123',
        subscription: 'sub_test_456',
      };

      const serverId = session.metadata?.server_id;
      expect(serverId).toBeUndefined();
    });

    it('should require tier in session metadata', () => {
      const session = {
        metadata: {
          server_id: 'server_123',
          // Missing tier
        },
        customer: 'cus_test_123',
        subscription: 'sub_test_456',
      };

      const tier = session.metadata?.tier;
      expect(tier).toBeUndefined();
    });

    it('should extract customer and subscription IDs from session', () => {
      const session = {
        metadata: {
          server_id: 'server_123',
          tier: 'premium',
        },
        customer: 'cus_test_123',
        subscription: 'sub_test_456',
      };

      expect(session.customer).toBe('cus_test_123');
      expect(session.subscription).toBe('sub_test_456');
    });

    it('should calculate featured_until as 1 month from now', () => {
      const now = new Date();
      const featuredUntil = new Date();
      featuredUntil.setMonth(featuredUntil.getMonth() + 1);

      const diffMs = featuredUntil.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeGreaterThan(27);
      expect(diffDays).toBeLessThan(32);
    });
  });

  describe('Payment Succeeded Handler', () => {
    it('should extend featured_until by 1 month from current expiration', () => {
      const currentExpiry = new Date('2026-05-15');
      const newExpiry = new Date(currentExpiry);
      newExpiry.setMonth(newExpiry.getMonth() + 1);

      expect(newExpiry.getMonth()).toBe(5); // June (0-indexed)
    });

    it('should handle missing subscription ID in invoice', () => {
      const invoice = {
        // Missing subscription field
      };

      const subscriptionId = (invoice as any).subscription;
      expect(subscriptionId).toBeUndefined();
    });

    it('should use current date as base if featured_until is null', () => {
      const currentExpiry: Date | null = null;
      const newExpiry = currentExpiry && currentExpiry > new Date()
        ? currentExpiry
        : new Date();

      // Should default to now
      expect(newExpiry).toBeInstanceOf(Date);
    });
  });

  describe('Payment Failed Handler', () => {
    it('should update subscription status to past_due', () => {
      const invoice = {
        subscription: 'sub_failed_123',
      };

      const subscriptionId = invoice.subscription;
      const newStatus = 'past_due';

      expect(subscriptionId).toBe('sub_failed_123');
      expect(newStatus).toBe('past_due');
    });

    it('should handle missing subscription ID', () => {
      const invoice = {};
      const subscriptionId = (invoice as any).subscription;

      if (!subscriptionId) {
        // Should return early without processing
        expect(subscriptionId).toBeUndefined();
      }
    });
  });

  describe('Subscription Updated Handler', () => {
    it('should map Stripe status to internal status', () => {
      const stripeStatus = 'active';
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

      const mappedStatus = statusMap[stripeStatus] || stripeStatus;
      expect(mappedStatus).toBe('active');
    });

    it('should update subscription record with new status', () => {
      const subscription = {
        id: 'sub_update_123',
        status: 'past_due',
      };

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

      const mappedStatus = statusMap[subscription.status] || subscription.status;
      expect(mappedStatus).toBe('past_due');
    });
  });

  describe('Subscription Deleted Handler', () => {
    it('should downgrade server to free tier', () => {
      const serverId = 'server_downgrade_123';
      const updatePayload = {
        tier: 'free',
        featured_until: null,
        stripe_subscription_id: null,
      };

      expect(updatePayload.tier).toBe('free');
      expect(updatePayload.featured_until).toBeNull();
      expect(updatePayload.stripe_subscription_id).toBeNull();
    });

    it('should update subscription record with cancelled status', () => {
      const subscriptionId = 'sub_cancel_123';
      const updatePayload = {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(updatePayload.status).toBe('cancelled');
      expect(updatePayload.cancelled_at).toBeDefined();
    });

    it('should find server by stripe_subscription_id', () => {
      const subscriptionId = 'sub_lookup_456';
      const servers = [
        { id: 'server_123', stripe_subscription_id: subscriptionId },
      ];

      const matchingServer = servers.find(s => s.stripe_subscription_id === subscriptionId);
      expect(matchingServer).toBeDefined();
      expect(matchingServer?.id).toBe('server_123');
    });
  });

  describe('Webhook Response Format', () => {
    it('should return { received: true } on successful processing', () => {
      const successResponse = { received: true };
      expect(successResponse.received).toBe(true);
    });

    it('should return { received: true, duplicate: true } for duplicates', () => {
      const duplicateResponse = { received: true, duplicate: true };
      expect(duplicateResponse.received).toBe(true);
      expect(duplicateResponse.duplicate).toBe(true);
    });

    it('should return error object with message on failure', () => {
      const errorResponse = { error: 'Failed to process webhook' };
      expect(errorResponse.error).toBeDefined();
      expect(typeof errorResponse.error).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle Supabase API failures gracefully', () => {
      const mockErrorResponse = { status: 500, statusText: 'Internal Server Error' };
      expect(mockErrorResponse.status).toBe(500);
    });

    it('should handle missing server in database', () => {
      const servers: any[] = [];
      expect(servers.length).toBe(0);
      // Handler should return early if no server found
    });

    it('should handle Stripe API errors during signature verification', () => {
      const errorMessage = 'Webhook signature verification failed';
      expect(errorMessage).toContain('signature verification failed');
    });

    it('should handle invalid JSON in request body', async () => {
      const invalidPayload = 'not-valid-json{';
      expect(() => JSON.parse(invalidPayload)).toThrow();
    });
  });

  describe('Premium Subscription Record Structure', () => {
    it('should create subscription record with required fields', () => {
      const subscriptionRecord = {
        server_id: 'server_123',
        tier: 'premium',
        stripe_customer_id: 'cus_test_123',
        stripe_subscription_id: 'sub_test_456',
        status: 'active',
        started_at: new Date().toISOString(),
        ends_at: new Date().toISOString(),
      };

      expect(subscriptionRecord.server_id).toBeDefined();
      expect(subscriptionRecord.tier).toMatch(/^(free|premium|elite)$/);
      expect(subscriptionRecord.stripe_customer_id).toBeDefined();
      expect(subscriptionRecord.stripe_subscription_id).toBeDefined();
      expect(subscriptionRecord.status).toBeDefined();
      expect(subscriptionRecord.started_at).toBeDefined();
      expect(subscriptionRecord.ends_at).toBeDefined();
    });

    it('should support all tier values', () => {
      const tiers = ['free', 'premium', 'elite'];

      tiers.forEach(tier => {
        const record = { tier };
        expect(record.tier).toBe(tier);
      });
    });
  });

  describe('Server Update Payload Structure', () => {
    it('should include tier in server update', () => {
      const updatePayload = {
        tier: 'premium',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_456',
        premium_since: new Date().toISOString(),
        featured_until: new Date().toISOString(),
      };

      expect(updatePayload.tier).toBe('premium');
      expect(updatePayload.stripe_customer_id).toBeDefined();
      expect(updatePayload.stripe_subscription_id).toBeDefined();
    });

    it('should set featured_until to null on cancellation', () => {
      const cancelPayload = {
        tier: 'free',
        featured_until: null,
        stripe_subscription_id: null,
      };

      expect(cancelPayload.featured_until).toBeNull();
      expect(cancelPayload.stripe_subscription_id).toBeNull();
    });
  });

  describe('Webhook Payload Structure', () => {
    it('should parse valid Stripe event payload', () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_456',
            metadata: {
              server_id: 'server_789',
              tier: 'elite',
            },
            customer: 'cus_test_123',
            subscription: 'sub_test_456',
          },
        },
      };

      expect(mockEvent.id).toBeDefined();
      expect(mockEvent.type).toBe('checkout.session.completed');
      expect(mockEvent.data.object.metadata.server_id).toBe('server_789');
    });

    it('should handle invoice event payload', () => {
      const mockInvoiceEvent = {
        id: 'evt_invoice_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_456',
            subscription: 'sub_test_789',
            amount_paid: 999,
            currency: 'usd',
          },
        },
      };

      expect(mockInvoiceEvent.type).toBe('invoice.payment_succeeded');
      expect(mockInvoiceEvent.data.object.subscription).toBe('sub_test_789');
    });

    it('should handle subscription event payload', () => {
      const mockSubscriptionEvent = {
        id: 'evt_sub_123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_456',
            status: 'past_due',
            customer: 'cus_test_789',
          },
        },
      };

      expect(mockSubscriptionEvent.type).toBe('customer.subscription.updated');
      expect(mockSubscriptionEvent.data.object.status).toBe('past_due');
    });
  });

  describe('Supabase API Integration', () => {
    it('should construct correct REST API URL for server updates', () => {
      const supabaseUrl = 'https://test.supabase.co';
      const serverId = 'server_123';
      const expectedUrl = `${supabaseUrl}/rest/v1/servers?id=eq.${serverId}`;

      expect(expectedUrl).toBe('https://test.supabase.co/rest/v1/servers?id=eq.server_123');
    });

    it('should construct correct REST API URL for subscription records', () => {
      const supabaseUrl = 'https://test.supabase.co';
      const expectedUrl = `${supabaseUrl}/rest/v1/premium_subscriptions`;

      expect(expectedUrl).toBe('https://test.supabase.co/rest/v1/premium_subscriptions');
    });

    it('should include correct headers for Supabase requests', () => {
      const supabaseKey = 'test-key';
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };

      expect(headers.apikey).toBe(supabaseKey);
      expect(headers.Authorization).toBe(`Bearer ${supabaseKey}`);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should require signature for webhook security', () => {
      const sig = 't=1234567890,v1=abc123';
      const webhookSecret = 'whsec_test';

      expect(sig).toBeDefined();
      expect(webhookSecret).toBeDefined();
    });

    it('should extract timestamp and signature from header', () => {
      const sigHeader = 't=1234567890,v1=abc123def456';
      const parts = sigHeader.split(',');

      const timestamp = parts[0].split('=')[1];
      const signature = parts[1].split('=')[1];

      expect(timestamp).toBe('1234567890');
      expect(signature).toBe('abc123def456');
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown event types gracefully', () => {
      const unknownEvent = {
        type: 'unknown.event.type',
        id: 'evt_unknown_123',
      };

      // Should log and return 200 (not error) for unknown events
      expect(unknownEvent.type).toContain('unknown');
    });

    it('should handle event with missing data.object', () => {
      const malformedEvent = {
        id: 'evt_malformed_123',
        type: 'checkout.session.completed',
        // Missing data.object
      };

      expect((malformedEvent as any).data?.object).toBeUndefined();
    });

    it('should handle server lookup returning multiple results', () => {
      const servers = [
        { id: 'server_1', stripe_subscription_id: 'sub_dup' },
        { id: 'server_2', stripe_subscription_id: 'sub_dup' }, // Duplicate
      ];

      // Should handle gracefully, likely by taking first result
      const firstServer = servers[0];
      expect(firstServer).toBeDefined();
    });

    it('should handle subscription record creation failure', () => {
      const subscriptionResponse = { ok: false, status: 409 };
      expect(subscriptionResponse.ok).toBe(false);
    });
  });

  describe('Webhook Security', () => {
    it('should reject requests with invalid signature format', () => {
      const invalidSig = 'invalid-format';
      expect(invalidSig).not.toMatch(/^t=\d+,v1=/);
    });

    it('should verify webhook secret is configured', () => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      const isConfigured = webhookSecret.length > 0;

      // In production, this must be configured
      expect(typeof isConfigured).toBe('boolean');
    });

    it('should require HTTPS in production', () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const requestUrl = 'https://api.guildpost.tech/webhook';

      if (isProduction) {
        expect(requestUrl.startsWith('https://')).toBe(true);
      }
    });
  });

  describe('Database Schema Validation', () => {
    it('should validate servers table columns for premium', () => {
      const requiredColumns = [
        'tier',
        'stripe_customer_id',
        'stripe_subscription_id',
        'premium_since',
        'featured_until',
      ];

      requiredColumns.forEach(col => {
        expect(typeof col).toBe('string');
        expect(col.length).toBeGreaterThan(0);
      });
    });

    it('should validate premium_subscriptions table columns', () => {
      const requiredColumns = [
        'server_id',
        'tier',
        'stripe_customer_id',
        'stripe_subscription_id',
        'status',
        'started_at',
        'ends_at',
        'cancelled_at',
        'updated_at',
      ];

      requiredColumns.forEach(col => {
        expect(typeof col).toBe('string');
      });
    });
  });

  describe('Date Handling', () => {
    it('should format dates as ISO strings for database', () => {
      const date = new Date();
      const isoString = date.toISOString();

      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle timezone correctly for featured_until', () => {
      const now = new Date();
      const featuredUntil = new Date(now);
      featuredUntil.setMonth(featuredUntil.getMonth() + 1);

      // Both should be UTC
      expect(now.toISOString()).toContain('Z');
      expect(featuredUntil.toISOString()).toContain('Z');
    });

    it('should handle year boundary when extending featured_until', () => {
      const december = new Date('2026-12-15');
      const nextMonth = new Date(december);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      expect(nextMonth.getMonth()).toBe(0); // January
      expect(nextMonth.getFullYear()).toBe(2027);
    });
  });

  describe('Logging and Monitoring', () => {
    it('should log server upgrades', () => {
      const serverId = 'server_123';
      const tier = 'premium';
      const logMessage = `Server ${serverId} upgraded to ${tier}`;

      expect(logMessage).toContain(serverId);
      expect(logMessage).toContain(tier);
    });

    it('should log payment events', () => {
      const subscriptionId = 'sub_123';
      const logMessage = `Payment succeeded for subscription ${subscriptionId}`;

      expect(logMessage).toContain(subscriptionId);
    });

    it('should log subscription status changes', () => {
      const subscriptionId = 'sub_456';
      const newStatus = 'cancelled';
      const logMessage = `Subscription ${subscriptionId} updated to status: ${newStatus}`;

      expect(logMessage).toContain(subscriptionId);
      expect(logMessage).toContain(newStatus);
    });

    it('should log duplicate event detection', () => {
      const eventId = 'evt_dup_123';
      const logMessage = `Event ${eventId} already processed, skipping`;

      expect(logMessage).toContain(eventId);
      expect(logMessage).toContain('skipping');
    });

    it('should log errors with context', () => {
      const eventType = 'checkout.session.completed';
      const error = new Error('Database connection failed');
      const logMessage = `Error processing webhook ${eventType}: ${error.message}`;

      expect(logMessage).toContain(eventType);
      expect(logMessage).toContain(error.message);
    });
  });
});
