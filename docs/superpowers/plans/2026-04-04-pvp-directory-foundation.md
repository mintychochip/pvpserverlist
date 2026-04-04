# PvP Directory — Foundation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold Next.js project on Vercel, create Supabase project, define database schema, configure environment variables.

**Architecture:** Next.js 15 App Router with TypeScript, Tailwind CSS dark theme. Supabase for Postgres + Edge Functions. Vercel for hosting.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Supabase CLI, Vercel CLI

---

## Chunk 1: Project Scaffold

### Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `.env.local.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pvpserverlist",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > types/supabase.ts",
    "db:migrate": "supabase db push"
  },
  "dependencies": {
    "next": "15.2.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "@supabase/supabase-js": "^2.47.0",
    "@supabase/ssr": "^0.5.2",
    "lucide-react": "^0.468.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "15.2.0",
    "supabase": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }
    ]
  }
};

export default nextConfig;
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  darkMode: "class",
};

export default config;
```

- [ ] **Step 5: Create postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create .env.local.example**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROJECT_ID=your-project-id
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
.next/
.env.local
.env*.local
*.log
.DS_Store
```

- [ ] **Step 8: Commit**

```bash
git add package.json next.config.ts tsconfig.json tailwind.config.ts postcss.config.js .env.local.example .gitignore
git commit -m "chore: scaffold Next.js 15 project with TypeScript and Tailwind"
```

---

### Task 2: Global CSS + Layout

**Files:**
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0a0a0f;
  --foreground: #ededed;
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 2: Create layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "PvP Index — Best Minecraft PvP Servers",
  description: "Find the best Minecraft PvP servers with real-time latency checks, ranked by performance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create lib/utils.ts**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create src/app/page.tsx**

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">PvP Index</h1>
      <p className="text-muted-foreground mt-2">Minecraft server directory coming soon.</p>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx src/lib/utils.ts
git commit -m "chore: add global CSS, layout, and utility functions"
```

---

## Chunk 2: Supabase Setup

### Task 3: Initialize Supabase Project

- [ ] **Step 1: Install Supabase CLI if not present**

Run: `npm install -g supabase`
Expected: CLI installed

- [ ] **Step 2: Login to Supabase**

Run: `supabase login`
Expected: Browser opens for authentication

- [ ] **Step 3: Link to project**

Run: `supabase link --project-ref your-project-ref`
Expected: Project linked successfully

- [ ] **Step 4: Initialize Supabase locally**

Run: `supabase init`
Expected: Creates `supabase/config.toml` and `supabase/migrations/`

- [ ] **Step 5: Commit supabase config**

```bash
git add supabase/config.toml
git commit -m "chore: initialize Supabase local project"
```

---

### Task 4: Create Database Schema Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write migration**

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Servers table
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT UNIQUE NOT NULL,
  port INTEGER NOT NULL DEFAULT 25565,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  tags TEXT[] DEFAULT '{}',
  verified BOOLEAN DEFAULT false,
  votifier_key TEXT,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Server status cache
CREATE TABLE server_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  status BOOLEAN DEFAULT false,
  latency_ms INTEGER,
  player_count INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 0,
  motd TEXT,
  last_checked TIMESTAMPTZ DEFAULT now(),
  UNIQUE(server_id)
);

-- Votes with 24h cooldown tracked at query time
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  visitor_ip TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Verification tokens for no-plugin MOTD verification
CREATE TABLE verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  motd_pattern TEXT NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes'),
  verified_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_servers_ip ON servers(ip);
CREATE INDEX idx_servers_tags ON servers USING GIN(tags);
CREATE INDEX idx_server_status_server_id ON server_status(server_id);
CREATE INDEX idx_votes_server_id ON votes(server_id);
CREATE INDEX idx_votes_visitor_ip ON votes(visitor_ip);
CREATE INDEX idx_votes_created_at ON votes(created_at);
CREATE INDEX idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX idx_verification_tokens_expires_at ON verification_tokens(expires_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER servers_updated_at
  BEFORE UPDATE ON servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;

-- Public read access for servers and status
CREATE POLICY "Public read servers" ON servers FOR SELECT USING (true);
CREATE POLICY "Public read server_status" ON server_status FOR SELECT USING (true);

-- Service role can do everything (for Edge Functions)
-- Votes: anyone can insert, but cooldown enforced in application logic
CREATE POLICY "Public insert votes" ON votes FOR INSERT WITH CHECK (true);
```

- [ ] **Step 2: Push migration to Supabase**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Generate TypeScript types**

Run: `supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/lib/supabase.ts`
Expected: Types generated in `src/lib/supabase.ts`

- [ ] **Step 4: Commit migration**

```bash
git add supabase/migrations/001_initial_schema.sql src/lib/supabase.ts
git commit -m "feat: add database schema with servers, server_status, votes, verification_tokens tables"
```

---

### Task 5: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Create client-side Supabase client**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server-side Supabase client**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component - ignore
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create admin client for Edge Functions**

```typescript
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/admin.ts
git commit -m "chore: add Supabase client helpers (browser, server, admin)"
```

---

## Chunk 3: Vercel Deployment

### Task 6: Vercel Setup

- [ ] **Step 1: Install Vercel CLI**

Run: `npm install -g vercel`
Expected: CLI installed

- [ ] **Step 2: Login to Vercel**

Run: `vercel login`
Expected: Browser opens for authentication

- [ ] **Step 3: Deploy to preview**

Run: `vercel`
Expected: Deployment URL generated

- [ ] **Step 4: Add production environment variables**

Run: `vercel env add NEXT_PUBLIC_SUPABASE_URL` → enter value
Run: `vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY` → enter value
Run: `vercel env add SUPABASE_SERVICE_ROLE_KEY` → enter value (set as secret)
Run: `vercel env add SUPABASE_PROJECT_ID` → enter value

- [ ] **Step 5: Deploy to production**

Run: `vercel --prod`
Expected: Production URL live

- [ ] **Step 6: Commit**

```bash
git add vercel.json 2>/dev/null || true
git commit -m "chore: configure Vercel deployment" || echo "No new files to commit"
```

---

## Chunk 4: Supabase Edge Functions Local Dev

### Task 7: Edge Functions Dev Setup

**Files:**
- Create: `supabase/functions/slp-ping/index.ts`
- Create: `supabase/functions/verify-server/index.ts`

- [ ] **Step 1: Create slp-ping Edge Function stub**

```typescript
// supabase/functions/slp-ping/index.ts
// Full SLP ping implementation will be in Plan 2
// This stub is a placeholder that compiles

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Create verify-server Edge Function stub**

```typescript
// supabase/functions/verify-server/index.ts
// Full verification implementation will be in Plan 3

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/slp-ping/index.ts supabase/functions/verify-server/index.ts
git commit -m "chore: add Edge Function stubs for slp-ping and verify-server"
```

---

**Foundation plan complete.** Next: execute Plan 2 (Core Ping System) and Plan 3 (Frontend + Features) in parallel.
