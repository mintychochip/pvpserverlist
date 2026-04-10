-- Add Discord verification fields to servers table

-- Add columns for Discord verification
ALTER TABLE servers 
ADD COLUMN IF NOT EXISTS discord_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS discord_guild_id TEXT,
ADD COLUMN IF NOT EXISTS discord_guild_name TEXT,
ADD COLUMN IF NOT EXISTS discord_verified_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_servers_discord_verified ON servers(discord_verified) WHERE discord_verified = TRUE;

-- Add comment explaining the fields
COMMENT ON COLUMN servers.discord_verified IS 'Whether the Discord server ownership has been verified via OAuth';
COMMENT ON COLUMN servers.discord_guild_id IS 'Discord guild ID of the verified Discord server';
COMMENT ON COLUMN servers.discord_guild_name IS 'Discord guild name of the verified Discord server';
COMMENT ON COLUMN servers.discord_verified_at IS 'Timestamp when Discord verification was completed';

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'servers' 
AND column_name IN ('discord_verified', 'discord_guild_id', 'discord_guild_name', 'discord_verified_at')
ORDER BY ordinal_position;