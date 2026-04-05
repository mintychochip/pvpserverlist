# Server Owner Auth & Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auth (Google + GitHub OAuth + email/password) so server owners can sign up, submit servers, and manage them via a dashboard.

**Architecture:** Supabase Auth with SSR cookies. Next.js middleware protects `/dashboard`, `/submit`, `/profile`. Client-side auth state via `@supabase/ssr` browser client. Server components use `createServerClient` with cookie adapter.

**Tech Stack:** Supabase Auth, Next.js 14 App Router, `@supabase/ssr`, Tailwind CSS.

---

## File Map

### New Files
| Path | Purpose |
|------|---------|
| `src/middleware.ts` | Auth route protection, session refresh |
| `src/app/login/page.tsx` | Login/signup page |
| `src/app/auth/callback/route.ts` | OAuth callback handler |
| `src/app/api/auth/logout/route.ts` | Logout API |
| `src/app/dashboard/page.tsx` | Owner dashboard |
| `src/app/api/servers/[id]/route.ts` | PATCH/DELETE with ownership check |
| `src/components/auth/LoginForm.tsx` | Email/password form |
| `src/components/auth/OAuthButtons.tsx` | Google + GitHub OAuth buttons |
| `src/components/auth/UserMenu.tsx` | Avatar dropdown in header |
| `src/components/dashboard/DashboardServerCard.tsx` | Server card with edit/delete |
| `src/components/dashboard/EditServerModal.tsx` | Inline edit modal |
| `supabase/migrations/2026-04-04-add-owner-id.sql` | DB schema changes |

### Modified Files
| Path | Change |
|------|--------|
| `src/app/layout.tsx` | Add UserMenu to header nav |
| `src/app/page.tsx` | Show Dashboard/Logout when logged in |
| `src/app/submit/page.tsx` | Require auth, redirect to login |
| `src/components/submit/SubmitForm.tsx` | Include owner_id on submit |
| `src/app/api/submit/route.ts` | Accept and store owner_id |
| `src/app/submit/verify/[serverId]/page.tsx` | Require auth |

---

## Environment Variables Needed

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_PUBLISHABLE_KEY=
SECRET_KEY=
# Add these OAuth credentials from Supabase dashboard:
NEXT_PUBLIC_SUPABASE_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_SUPABASE_GOOGLE_SECRET=
NEXT_PUBLIC_SUPABASE_GITHUB_CLIENT_ID=
NEXT_PUBLIC_SUPABASE_GITHUB_SECRET=
```

> **Note:** OAuth credentials are configured in Supabase dashboard → Authentication → Providers. The user must set these up in their Supabase project. The code assumes they exist.

---

## Chunk 1: Database & Middleware

### Task 1: Create database migration

**File:** `supabase/migrations/2026-04-04-add-owner-id.sql`

```sql
-- Add owner_id to servers table
ALTER TABLE servers
ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create profiles table (auto-created by Supabase if you enable "Personal projects" setting,
-- but we create manually for control)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update only their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Servers: anyone can read, only owner can update/delete
CREATE POLICY "Servers are viewable by everyone" ON servers FOR SELECT USING (true);
CREATE POLICY "Servers are insertable by authenticated users" ON servers FOR INSERT WITH CHECK (auth.uid() = owner_id OR owner_id IS NULL);
CREATE POLICY "Owners can update own servers" ON servers FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete own servers" ON servers FOR DELETE USING (auth.uid() = owner_id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

- [ ] **Step 1: Save migration file**

```bash
# No command needed - just save the file above to the migration path
```

- [ ] **Step 2: Apply migration**
> Run in Supabase dashboard SQL editor or via Supabase CLI:
```bash
supabase db push
# OR run the SQL directly in Supabase SQL Editor
```
Expected: Migration applies without errors. New `profiles` table and `owner_id` column exist.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/2026-04-04-add-owner-id.sql
git commit -m "db: add owner_id column and profiles table with RLS policies"
```

---

### Task 2: Create middleware

**File:** `src/middleware.ts`

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protected routes
  const protectedRoutes = ["/dashboard", "/submit", "/profile"];
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (!user && isProtected) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 1: Create middleware file**
- [ ] **Step 2: Commit**
```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware for protected routes"
```

---

## Chunk 2: Auth Callback & Login Page

### Task 3: Create OAuth callback handler

**File:** `src/app/auth/callback/route.ts`

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            cookiesToSet.forEach(({ name, value, options }) =>
              NextResponse.next({ request }).cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

- [ ] **Step 1: Create callback route** at `src/app/auth/callback/route.ts`
- [ ] **Step 2: Commit**
```bash
git add src/app/auth/callback/route.ts
git commit -m "feat: add OAuth callback handler"
```

---

### Task 4: Create OAuthButtons component

**File:** `src/components/auth/OAuthButtons.tsx`

```typescript
"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export function OAuthButtons({ redirectTo }: { redirectTo?: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const supabase = createClient();

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(provider);
    const redirectUrl = redirectTo
      ? `/auth/callback?next=${encodeURIComponent(redirectTo)}`
      : "/auth/callback";
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${redirectUrl}`,
      },
    });
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => handleOAuth("google")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading === "google" ? (
          <span className="animate-spin">⟳</span>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        Continue with Google
      </button>

      <button
        onClick={() => handleOAuth("github")}
        disabled={loading !== null}
        className="w-full flex items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading === "github" ? (
          <span className="animate-spin">⟳</span>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        )}
        Continue with GitHub
      </button>
    </div>
  );
}
```

- [ ] **Step 1: Create OAuthButtons component**
- [ ] **Step 2: Commit**
```bash
git add src/components/auth/OAuthButtons.tsx
git commit -m "feat: add OAuth buttons component"
```

---

### Task 5: Create LoginForm component

**File:** `src/components/auth/LoginForm.tsx`

```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email for a confirmation link.");
      }
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-900/20 border border-green-800 text-green-400 px-4 py-2 rounded-lg text-sm">
          {message}
        </div>
      )}

      <div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <div>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        {mode === "signin" ? (
          <>
            Don't have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-indigo-400 hover:text-indigo-300"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-indigo-400 hover:text-indigo-300"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}
```

- [ ] **Step 1: Create LoginForm component**
- [ ] **Step 2: Commit**
```bash
git add src/components/auth/LoginForm.tsx
git commit -m "feat: add email/password login form"
```

---

### Task 6: Create login page

**File:** `src/app/login/page.tsx`

```typescript
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">PvP Index</h1>
          <p className="text-zinc-500 text-sm">Sign in to manage your servers</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <OAuthButtons />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-zinc-900 px-4 text-zinc-600">or</span>
            </div>
          </div>

          <LoginForm />
        </div>

        {searchParams && (
          <p className="text-center text-xs text-zinc-600 mt-4">
            <Link href="/" className="hover:text-zinc-400">
              ← Back to PvP Index
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Create login page** at `src/app/login/page.tsx`
- [ ] **Step 2: Commit**
```bash
git add src/app/login/page.tsx
git commit -m "feat: add login page with OAuth and email/password"
```

---

## Chunk 3: Dashboard & Owner Management

### Task 7: Create logout API route

**File:** `src/app/api/auth/logout/route.ts`

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            NextResponse.next({ request }).cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 1: Create logout route**
- [ ] **Step 2: Commit**
```bash
git add src/app/api/auth/logout/route.ts
git commit -m "feat: add logout API route"
```

---

### Task 8: Create UserMenu component

**File:** `src/components/auth/UserMenu.tsx`

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; avatar_url?: string; display_name?: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  if (!user) return null;

  const initials = user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl py-1 z-50">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-sm text-white truncate">{user.email}</p>
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 1: Create UserMenu component**
- [ ] **Step 2: Commit**
```bash
git add src/components/auth/UserMenu.tsx
git commit -m "feat: add user menu dropdown component"
```

---

### Task 9: Create server edit/delete API route

**File:** `src/app/api/servers/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!server || server.owner_id !== user.id) {
    return NextResponse.json({ error: "Not your server" }, { status: 403 });
  }

  const { name, description, version, tags } = body;
  const { data, error } = await supabase
    .from("servers")
    .update({ name, description, version, tags })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: server } = await supabase
    .from("servers")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!server || server.owner_id !== user.id) {
    return NextResponse.json({ error: "Not your server" }, { status: 403 });
  }

  const { error } = await supabase.from("servers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 1: Create server edit/delete API route** at `src/app/api/servers/[id]/route.ts`
- [ ] **Step 2: Commit**
```bash
git add src/app/api/servers/[id]/route.ts
git commit -m "feat: add server edit/delete API with ownership check"
```

---

### Task 10: Create EditServerModal component

**File:** `src/components/dashboard/EditServerModal.tsx`

```typescript
"use client";

import { useState } from "react";

const TAG_OPTIONS = [
  "crystal-pvp", "uhc-pvp", "sumo", "nodepuff", "lifesteal",
  "smp", "practice", "bridge", "hunger-games", "prison"
];

interface Server {
  id: string;
  ip: string;
  port: number;
  name: string;
  description: string | null;
  version: string | null;
  tags: string[];
}

export function EditServerModal({
  server,
  onClose,
  onSave,
}: {
  server: Server;
  onClose: () => void;
  onSave: (updated: Server) => void;
}) {
  const [form, setForm] = useState(server);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : [...f.tags, tag],
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      const updated = await res.json();
      onSave(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Edit Server</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-2 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Server Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Version</label>
            <input
              type="text"
              value={form.version ?? ""}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="1.20.4"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    form.tags.includes(tag)
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white py-2 rounded-lg transition-colors"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Create EditServerModal component**
- [ ] **Step 2: Commit**
```bash
git add src/components/dashboard/EditServerModal.tsx
git commit -m "feat: add server edit modal component"
```

---

### Task 11: Create DashboardServerCard component

**File:** `src/components/dashboard/DashboardServerCard.tsx`

```typescript
"use client";

import { useState } from "react";
import { Server, Pencil, Trash2, ExternalLink } from "lucide-react";
import { EditServerModal } from "./EditServerModal";

interface Server {
  id: string;
  ip: string;
  port: number;
  name: string;
  description: string | null;
  version: string | null;
  tags: string[];
  verified: boolean;
  vote_count: number;
  server_status?: {
    status: boolean;
    player_count: number;
    max_players: number;
  } | null;
}

export function DashboardServerCard({ server }: { server: Server }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localServer, setLocalServer] = useState(server);

  const handleDelete = async () => {
    if (!confirm("Delete this server? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      window.location.reload();
    } catch {
      alert("Failed to delete server");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                {localServer.name}
                {localServer.verified && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                    Verified
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                {localServer.ip}:{localServer.port}
              </p>
            </div>
          </div>
        </div>

        {localServer.description && (
          <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
            {localServer.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1">
          {localServer.version && (
            <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
              {localServer.version}
            </span>
          )}
          {localServer.tags?.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
          <a
            href={`/servers/${server.ip}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            View listing
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? "..." : "Delete"}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <EditServerModal
          server={localServer}
          onClose={() => setEditing(false)}
          onSave={(updated) => {
            setLocalServer(updated);
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 1: Create DashboardServerCard component**
- [ ] **Step 2: Commit**
```bash
git add src/components/dashboard/DashboardServerCard.tsx
git commit -m "feat: add dashboard server card with edit/delete"
```

---

### Task 12: Create dashboard page

**File:** `src/app/dashboard/page.tsx`

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardServerCard } from "@/components/dashboard/DashboardServerCard";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  const { data: servers } = await supabase
    .from("servers")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-white">PvP Index</Link>
          <nav className="flex gap-4">
            <Link href="/" className="text-sm text-zinc-400 hover:text-white transition-colors">Browse</Link>
            <Link href="/submit" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
              + Submit Server
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">My Servers</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              {servers?.length ?? 0} server{servers?.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          <Link
            href="/submit"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </Link>
        </div>

        {!servers?.length ? (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-4xl mb-3">🎮</div>
            <h2 className="text-xl font-semibold text-white mb-2">No servers yet</h2>
            <p className="text-zinc-500 mb-6">
              Submit your first server to get listed on PvP Index.
            </p>
            <Link
              href="/submit"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Submit Your Server
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {servers.map((server) => (
              <DashboardServerCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 1: Create dashboard page** at `src/app/dashboard/page.tsx`
- [ ] **Step 2: Commit**
```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add owner dashboard page"
```

---

## Chunk 4: Wire Everything Together

### Task 13: Update header nav in layout and home page

**Modify:** `src/app/layout.tsx` and `src/app/page.tsx`

In `layout.tsx`, the header already exists. We need to make it dynamic — show "Login" if not authenticated, "Dashboard" if authenticated. Since the header is in `page.tsx` (not layout), modify `page.tsx` to import `UserMenu` and conditionally show auth state.

Add to `src/app/page.tsx`:

```tsx
// Add to imports:
import { UserMenu } from "@/components/auth/UserMenu";
import { createClient } from "@/lib/supabase/server";

// In the header section, replace the nav with:
<nav className="flex gap-4 items-center">
  <Link href="/top" className="text-sm text-zinc-400 hover:text-white transition-colors">Top Servers</Link>
  {/* Show for logged out users */}
  <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Login</Link>
  {/* Show for logged in users — use UserMenu for avatar dropdown */}
  {/* UserMenu is client-side, so wrap in a div */}
  <div className="hidden md:block">
    <UserMenu />
  </div>
</nav>
```

**Better approach:** Create a `Header.tsx` client component that fetches auth state, since Server Components can't easily pass auth state to client components in the header without prop drilling.

```tsx
// src/components/layout/Header.tsx
"use client";
// Fetch user client-side, render nav based on auth state
```

**Simplest approach for now:** Keep header in page.tsx (server component), pass `user` from page.tsx as a prop to `UserMenu`.

In `page.tsx`, add `const supabase = await createClient()` and `const { data: { user } } = await supabase.auth.getUser()` — then pass `user` to `UserMenu`.

- [ ] **Step 1: Create Header component** at `src/components/layout/Header.tsx`
- [ ] **Step 2: Update page.tsx** to use Header
- [ ] **Step 3: Commit**
```bash
git add src/components/layout/Header.tsx src/app/page.tsx
git commit -m "feat: add dynamic header with auth-aware nav"
```

---

### Task 14: Update SubmitForm to include owner_id

**Modify:** `src/app/api/submit/route.ts`

Add owner_id from auth session:

```typescript
// Add after creating supabase admin client:
const { data: { user } } = await supabase.auth.getUser();

// In the insert:
.insert({
  ip,
  port: parseInt(port ?? "25565"),
  name,
  description: description ?? null,
  version: version ?? null,
  tags: tags ?? [],
  owner_id: user?.id ?? null,  // Add this
})
```

- [ ] **Step 1: Update submit API to include owner_id**
- [ ] **Step 2: Commit**
```bash
git add src/app/api/submit/route.ts
git commit -m "feat: link submitted servers to owner_id"
```

---

### Task 15: Update SubmitForm client component

**Modify:** `src/components/submit/SubmitForm.tsx`

The SubmitForm needs to check if user is authenticated before showing the form. Add at the top:

```typescript
import { useEffect, useState } from "react";
// ... existing imports

export function SubmitForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login?redirect=/submit");
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) {
    return <div className="text-center py-8 text-zinc-500">Checking auth...</div>;
  }
  // ... rest of form
}
```

- [ ] **Step 1: Update SubmitForm to check auth**
- [ ] **Step 2: Commit**
```bash
git add src/components/submit/SubmitForm.tsx
git commit -m "feat: require auth for submit form"
```

---

### Task 16: Verify submit verify page auth

**Modify:** `src/app/submit/verify/[serverId]/page.tsx`

Add auth check similar to submit form — redirect to login if not authenticated.

```typescript
// Add to the verify page:
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

// In the page component:
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login?redirect=/submit/verify/" + params.serverId);
```

- [ ] **Step 1: Add auth check to verify page**
- [ ] **Step 2: Commit**
```bash
git add "src/app/submit/verify/[serverId]/page.tsx"
git commit -m "feat: require auth for server verification"
```

---

## Summary

After all tasks:
- `/login` — Google + GitHub OAuth + email/password
- `/dashboard` — List of owner's servers with edit/delete
- `/submit` — Requires login, links server to owner
- Header nav — Shows Dashboard/Logout when logged in
- All API routes protected with ownership checks
