-- Migration: Player Reviews System with Verification
-- Run this in your Supabase SQL editor

-- Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id TEXT NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    
    -- Reviewer info (Minecraft username + optional GuildPost account)
    reviewer_minecraft_username TEXT NOT NULL,
    reviewer_guildpost_user_id UUID REFERENCES auth.users(id),
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    content TEXT NOT NULL CHECK (LENGTH(content) >= 10 AND LENGTH(content) <= 2000),
    
    -- Verification
    is_verified BOOLEAN DEFAULT false, -- Played on server for minimum time
    playtime_hours INTEGER, -- Estimated hours played (if verified)
    verification_method TEXT CHECK (verification_method IN ('server_logs', 'screenshot', 'manual')),
    
    -- Voting/helpfulness
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    
    -- Moderation
    is_approved BOOLEAN DEFAULT true, -- Auto-approved, can be moderated later
    is_featured BOOLEAN DEFAULT false, -- Server owner can feature good reviews
    moderated_by UUID REFERENCES auth.users(id),
    moderated_at TIMESTAMP WITH TIME ZONE,
    moderation_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One review per user per server
    UNIQUE(server_id, reviewer_minecraft_username)
);

-- Review Votes Table (track who voted helpful/not helpful)
CREATE TABLE IF NOT EXISTS public.review_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    voter_minecraft_username TEXT NOT NULL,
    voter_guildpost_user_id UUID REFERENCES auth.users(id),
    is_helpful BOOLEAN NOT NULL, -- true = helpful, false = not helpful
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One vote per user per review
    UNIQUE(review_id, voter_minecraft_username)
);

-- Server Owner Responses to Reviews
CREATE TABLE IF NOT EXISTS public.review_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    response TEXT NOT NULL CHECK (LENGTH(response) >= 5 AND LENGTH(response) <= 1000),
    responded_by TEXT NOT NULL, -- GuildPost user ID or 'server_owner'
    is_official BOOLEAN DEFAULT true, -- Official server owner response
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(review_id) -- One response per review
);

-- Review Reports (for moderation)
CREATE TABLE IF NOT EXISTS public.review_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    reporter_minecraft_username TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'fake', 'inappropriate', 'off_topic', 'other')),
    details TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_server_id ON public.reviews(server_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_verified ON public.reviews(is_verified) WHERE is_verified = true;
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON public.reviews(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON public.reviews(is_approved) WHERE is_approved = true;
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_votes_review_id ON public.review_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_server_id ON public.review_responses(server_id);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Reviews
CREATE POLICY "Allow public read approved reviews" ON public.reviews
    FOR SELECT TO anon USING (is_approved = true);

CREATE POLICY "Allow owners to see all their server reviews" ON public.reviews
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = reviews.server_id
            AND s.verified_owner = auth.email()
        )
    );
    
CREATE POLICY "Allow service role all" ON public.reviews
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policies for Review Votes
CREATE POLICY "Allow public read votes" ON public.review_votes
    FOR SELECT TO anon USING (true);
    
CREATE POLICY "Allow service role all" ON public.review_votes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policies for Review Responses
CREATE POLICY "Allow public read responses" ON public.review_responses
    FOR SELECT TO anon USING (true);
    
CREATE POLICY "Allow server owners to manage responses" ON public.review_responses
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.servers s
            WHERE s.id = review_responses.server_id
            AND s.verified_owner = auth.email()
        )
    );
    
CREATE POLICY "Allow service role all" ON public.review_responses
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function to update helpful counts
CREATE OR REPLACE FUNCTION update_review_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_helpful THEN
            UPDATE public.reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
        ELSE
            UPDATE public.reviews SET not_helpful_count = not_helpful_count + 1 WHERE id = NEW.review_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.is_helpful THEN
            UPDATE public.reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = OLD.review_id;
        ELSE
            UPDATE public.reviews SET not_helpful_count = GREATEST(not_helpful_count - 1, 0) WHERE id = OLD.review_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for vote counts
DROP TRIGGER IF EXISTS review_vote_trigger ON public.review_votes;
CREATE TRIGGER review_vote_trigger
    AFTER INSERT OR DELETE ON public.review_votes
    FOR EACH ROW EXECUTE FUNCTION update_review_vote_counts();

-- Function to calculate server average rating
CREATE OR REPLACE FUNCTION calculate_server_rating(p_server_id TEXT)
RETURNS TABLE(avg_rating NUMERIC, total_reviews INTEGER, verified_reviews INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROUND(AVG(rating)::NUMERIC, 2) as avg_rating,
        COUNT(*)::INTEGER as total_reviews,
        COUNT(*) FILTER (WHERE is_verified = true)::INTEGER as verified_reviews
    FROM public.reviews
    WHERE server_id = p_server_id
    AND is_approved = true;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON public.reviews TO anon, authenticated, service_role;
GRANT ALL ON public.review_votes TO anon, authenticated, service_role;
GRANT ALL ON public.review_responses TO anon, authenticated, service_role;
GRANT ALL ON public.review_reports TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION calculate_server_rating TO anon, authenticated, service_role;

-- Add rating columns to servers table for caching
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS avg_rating NUMERIC DEFAULT NULL;
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS verified_reviews INTEGER DEFAULT 0;

-- Create view for review summaries
CREATE OR REPLACE VIEW public.review_summaries AS
SELECT 
    r.id,
    r.server_id,
    r.reviewer_minecraft_username,
    r.rating,
    r.title,
    r.content,
    r.is_verified,
    r.playtime_hours,
    r.helpful_count,
    r.not_helpful_count,
    r.is_featured,
    r.created_at,
    r.updated_at,
    (SELECT response FROM public.review_responses WHERE review_id = r.id LIMIT 1) as owner_response,
    (SELECT responded_by FROM public.review_responses WHERE review_id = r.id LIMIT 1) as responded_by
FROM public.reviews r
WHERE r.is_approved = true;

COMMENT ON TABLE public.reviews IS 'Player reviews for Minecraft servers with verification';
COMMENT ON TABLE public.review_votes IS 'Helpfulness votes on reviews';
COMMENT ON TABLE public.review_responses IS 'Server owner responses to reviews';
COMMENT ON TABLE public.review_reports IS 'Moderation reports for inappropriate reviews';
COMMENT ON FUNCTION calculate_server_rating IS 'Calculate average rating and counts for a server';