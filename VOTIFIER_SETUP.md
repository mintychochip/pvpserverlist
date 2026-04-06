# GuildPost Votifier Integration

## Overview
This adds real Votifier-compatible voting to GuildPost with:
- Username-based voting with 24h cooldowns
- Votifier packet sending to Minecraft servers
- Discord webhook notifications
- Vote rewards on connected servers

## Database Schema Changes

### New Table: `votes`
```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL REFERENCES servers(id),
  username TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(server_id, username, created_at)
);

-- Index for cooldown lookups
CREATE INDEX idx_votes_server_user_time ON votes(server_id, username, created_at);
```

### Updated Table: `servers`
Add columns to existing `servers` table:
```sql
ALTER TABLE servers ADD COLUMN IF NOT EXISTS votifier_key TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS discord_webhook TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS votifier_port INTEGER DEFAULT 8192;
```

## Supabase Edge Function Setup

### 1. Deploy the Function
```bash
# Install Supabase CLI if not already
curl -fsSL https://cli.supabase.io/install.sh | sh

# Login
supabase login

# Link your project (use your project ref)
supabase link --project-ref wpxutsdbiampnxfgkjwq

# Deploy the function
supabase functions deploy vote

# Set environment variables
supabase secrets set SUPABASE_URL=https://wpxutsdbiampnxfgkjwq.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Enable CORS
Add to `supabase/config.toml`:
```toml
[api]
additional_origins = ["https://guildpost.tech", "https://*.guildpost.tech"]
```

### 3. Set Function Permissions
In Supabase Dashboard → Functions → Vote:
- Enable "Allow anonymous access" (votes are public)
- Or create an RLS policy if needed

## Votifier Setup (For Server Owners)

### 1. Install Votifier Plugin
Download from: https://github.com/NuVotifier/NuVotifier/releases

### 2. Configure Votifier
Edit `plugins/Votifier/config.yml`:
```yaml
host: 0.0.0.0
port: 8192
# Get the public key from rsa/public.key
```

### 3. Submit to GuildPost
When adding server, paste the contents of `plugins/Votifier/rsa/public.key` into the Votifier Public Key field.

### 4. Install VotingPlugin (Optional, for rewards)
To give players rewards when they vote:
- Install VotingPlugin or similar
- Configure rewards in its config

## Discord Notifications

### 1. Create Webhook
In Discord:
- Server Settings → Integrations → Webhooks
- New Webhook → Copy URL

### 2. Submit to GuildPost
Paste the webhook URL when adding/updating your server.

### 3. Test
Votes will appear in Discord:
```
✅ New Vote for YourServer
PlayerNotch just voted on GuildPost!
Total votes: 42
```

## API Usage

### Cast a Vote
```bash
POST https://wpxutsdbiampnxfgkjwq.supabase.co/functions/v1/vote
Content-Type: application/json

{
  "serverId": "123",
  "username": "Notch",
  "address": "optional-ip"
}
```

### Response
```json
{
  "success": true,
  "message": "Vote recorded and reward sent to server!",
  "vote": {
    "id": "uuid",
    "timestamp": "2026-04-06T10:30:00Z"
  },
  "votifierSent": true
}
```

### Cooldown Response (429)
```json
{
  "success": false,
  "message": "You already voted! Wait 12 more hours."
}
```

## Security Considerations

1. **Username Validation**: Only valid Minecraft usernames accepted (3-16 chars, alphanumeric + underscore)
2. **Cooldown Enforcement**: 24-hour cooldown per server per user (enforced server-side)
3. **IP Logging**: Optional IP tracking for abuse detection
4. **Rate Limiting**: Consider adding rate limits per IP in production
5. **Votifier Security**: Uses RSA encryption with server's public key

## Troubleshooting

### Votifier not receiving votes
1. Check server's firewall allows port 8192
2. Verify public key is correct (no extra spaces)
3. Check Votifier logs: `plugins/Votifier/latest.log`

### Discord notifications not working
1. Verify webhook URL is correct
2. Check webhook hasn't been deleted in Discord
3. Look at function logs in Supabase Dashboard

### Vote cooldown not working
1. Check `votes` table exists with proper indexes
2. Verify server timezone matches Supabase (UTC)
3. Check browser localStorage isn't cleared

## Anti-Abuse Features

### IP Quality Checks
The system checks every vote for:
- **Proxy/VPN detection** - Blocks residential proxies and VPNs
- **Tor detection** - Blocks Tor exit nodes
- **Datacenter detection** - Flags cloud servers (AWS, GCP, Azure, DO)
- **Country/ISP tracking** - For analytics and abuse patterns
- **Fraud scoring** - 0-100 score, blocks >80

### Rate Limits
- **Username**: 24 hours per server
- **IP Address**: 12 hours per server (stricter)
- **Device Fingerprint**: 24 hours per server
- **IP+Time Window**: Max 10 different usernames per IP per week

### API Keys (Optional but Recommended)
Get free API keys for better detection:

**IPHub** (1000 requests/day free):
```bash
supabase secrets set IPHUB_API_KEY="your_key_here"
```
Sign up: https://iphub.info/

**IPQualityScore** (5000 requests/month free):
```bash
supabase secrets set IPQUALITYSCORE_API_KEY="your_key_here"
```
Sign up: https://www.ipqualityscore.com/

Without API keys, the system uses basic datacenter IP range detection.

## Monitoring & Abuse Detection

View function logs:
```bash
supabase functions logs vote --tail
```

Monitor suspicious activity:
```sql
-- IPs with many different usernames (potential abuse)
SELECT * FROM suspicious_votes ORDER BY unique_usernames DESC;

-- Vote stats per server
SELECT * FROM get_server_vote_stats('your-server-id');

-- Recent VPN/proxy votes
SELECT server_id, username, ip_address, is_vpn, is_proxy, created_at
FROM votes 
WHERE is_vpn = true OR is_proxy = true
ORDER BY created_at DESC
LIMIT 50;
```

Check IP distribution:
```sql
SELECT 
  country,
  COUNT(*) as votes,
  COUNT(DISTINCT server_id) as servers
FROM votes
WHERE created_at >= now() - interval '24 hours'
GROUP BY country
ORDER BY votes DESC;
```
