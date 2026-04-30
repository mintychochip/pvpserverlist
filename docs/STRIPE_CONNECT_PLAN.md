# Stripe Connect Implementation Plan - GuildPost

**Status:** Research Phase  
**Priority:** High (revenue growth)  
**Target:** Enable server owners to receive payouts for premium upgrades, donations, or revenue sharing

## Overview

Current Stripe implementation handles **subscriptions** (server owners pay GuildPost for premium/elite tiers). Stripe Connect enables **marketplace payouts** — GuildPost can collect payments on behalf of server owners and pay them out (minus platform fee).

## Use Cases

1. **Donations/Tips** - Players tip server owners, GuildPost takes % fee
2. **Premium Revenue Share** - Server pays for premium, gets promoted, receives payout from featured slot revenue
3. **Digital Goods** - Server owners sell ranks/perks through GuildPost

## Implementation Requirements

### 1. Stripe Connect Account Types

**Express Connect** (Recommended for GuildPost)
- Onboard server owners in minutes
- Stripe handles identity verification
- GuildPost sets platform fee (e.g., 10%)
- Payouts automatic to owner's bank account

**Alternative: Standard Connect**
- Server owners create full Stripe account
- More control for them, more friction

### 2. Database Schema Changes

```sql
-- Add to servers table
ALTER TABLE servers ADD COLUMN stripe_connect_account_id TEXT;
ALTER TABLE servers ADD COLUMN connect_onboarding_status TEXT DEFAULT 'pending'; -- pending, active, rejected
ALTER TABLE servers ADD COLUMN connect_payouts_enabled BOOLEAN DEFAULT false;
ALTER TABLE servers ADD COLUMN platform_fee_percent INTEGER DEFAULT 10;

-- New table for Connect charges
CREATE TABLE connect_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id),
  stripe_charge_id TEXT,
  amount INTEGER, -- cents
  platform_fee INTEGER, -- cents
  payout_amount INTEGER, -- cents
  payer_email TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, paid, failed, refunded
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- New table for payouts to server owners
CREATE TABLE connect_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id),
  stripe_transfer_id TEXT,
  amount INTEGER, -- cents
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. API Endpoints Needed

| Endpoint | Purpose |
|----------|---------|
| `POST /api/stripe/connect/onboard` | Create Connect account, return onboarding URL |
| `GET /api/stripe/connect/status` | Check onboarding status |
| `POST /api/stripe/connect/donation` | Create payment intent for tipping server |
| `POST /api/stripe/connect/refresh` | Refresh onboarding link if expired |
| `POST /api/stripe/webhook` | Enhanced to handle Connect events |

### 4. Connect Onboarding Flow

```
1. Server owner clicks "Enable Tips/Donations" in dashboard
2. POST /api/stripe/connect/onboard
   - Creates Stripe Connect account
   - Generates onboarding link (account_onboarding)
   - Stores account_id in servers table
3. Owner completes Stripe onboarding (identity, bank account)
4. Stripe webhook: account.updated → set connect_onboarding_status = 'active'
5. Owner can now receive donations/payouts
```

### 5. Donation Payment Flow

```
1. Player clicks "Tip Server" on server page
2. POST /api/stripe/connect/donation
   - Creates PaymentIntent with transfer_data.destination = server.connect_account_id
   - application_fee_amount = platform fee (e.g., 10%)
3. Player completes payment via Stripe Elements
4. Stripe automatically splits: 90% to server owner, 10% to GuildPost
```

### 6. Environment Variables

```
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_ACCOUNT_ID=acct_... (GuildPost's main account)
```

### 7. Webhook Events to Handle

- `account.updated` - Track onboarding status
- `account.application.deauthorized` - Server owner disconnected
- `payment_intent.succeeded` (Connect) - Donation completed
- `transfer.created` - Payout initiated
- `transfer.failed` - Payout failed

### 8. UI Components Needed

- **Dashboard Connect Section** - Onboarding CTA, status badge
- **Tip Button** - Server page donation trigger
- **Payout History** - Table of received donations/payouts
- **Fee Display** - Show platform fee before payment

### 9. Security Considerations

- Verify server ownership before allowing Connect setup
- Use Stripe Connect onboarding URL with `refresh_url` and `return_url`
- Row Level Security: server owners only see their own Connect data
- Validate all amounts before creating PaymentIntents

### 10. Compliance

- Stripe Connect requires platform agreement acceptance
- Consider tax implications (1099-K forms for US users)
- Terms of service update needed (payout terms, chargeback policy)

## Next Steps

1. **Decision:** Confirm Express Connect vs Standard Connect
2. **Stripe Dashboard:** Enable Connect in Stripe settings
3. **Dev Work:** Create onboarding endpoint + webhook handlers
4. **DB Migration:** Add connect columns to servers table
5. **UI:** Build dashboard Connect section
6. **Testing:** Use Stripe Connect test mode with fake payouts

## Estimated Scope

- Backend: 2-3 API endpoints + webhook handlers
- Database: 2 new tables, 4 column additions
- Frontend: 3-4 new components
- Testing: ~15 new test cases

---
*Documented: April 30, 2026*  
*Research by: proactive-general agent*
