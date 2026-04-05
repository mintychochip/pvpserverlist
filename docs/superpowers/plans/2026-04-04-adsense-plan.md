# Google AdSense Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google AdSense ad placements across PvP Index — leaderboard, sidebar rectangle, skyscraper, and footer banner — with lazy loading and graceful fallback when AdSense is not configured.

**Architecture:** Three new ad components under `src/components/ads/`: `AdSenseScript` (global script injection in layout), `AdBanner` (individual ad slot renderer), and `SidebarAds` (rectangle + skyscraper wrapper). Pages opt-in to ad placements by using these components. Env vars gate whether ads render or empty placeholder is shown.

**Tech Stack:** Google AdSense (script injection, no npm package), Next.js 15 App Router, TypeScript, Tailwind CSS.

---

## Chunk 1: Ad Components (Foundation)

**Files:**
- Create: `src/components/ads/AdBanner.tsx`
- Create: `src/components/ads/SidebarAds.tsx`
- Create: `src/components/ads/AdSenseScript.tsx`
- Test: no test for pure UI component (manual verification)
- Reference spec: `docs/superpowers/specs/2026-04-04-adsense-design.md`

- [ ] **Step 1: Create AdSenseScript component**

Create `src/components/ads/AdSenseScript.tsx` — a small client component that injects the global Google AdSense script tag once.

```tsx
// src/components/ads/AdSenseScript.tsx
'use client';

import { useEffect } from 'react';

export function AdSenseScript() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) {
      const script = document.createElement('script');
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  }, []);

  return null;
}
```

- [ ] **Step 2: Create AdBanner component**

Create `src/components/ads/AdBanner.tsx` — client component that renders an ad slot.

```tsx
// src/components/ads/AdBanner.tsx
'use client';

import { useEffect, useRef } from 'react';

type AdSlot = 'leaderboard' | 'rectangle' | 'skyscraper' | 'footer';

interface AdBannerProps {
  slot: AdSlot;
  className?: string;
}

const SLOT_IDS: Record<AdSlot, string | undefined> = {
  leaderboard: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD,
  rectangle: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RECTANGLE,
  skyscraper: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR,
  footer: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR,
};

const SIZES: Record<AdSlot, string> = {
  leaderboard: '728x90',
  rectangle: '300x250',
  skyscraper: '160x600',
  footer: '728x90',
};

export function AdBanner({ slot, className = '' }: AdBannerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) return;
    if (!SLOT_IDS[slot]) return;

    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }, [slot]);

  if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) {
    return (
      <div
        className={`bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center ${className}`}
        style={{ minHeight: slot === 'skyscraper' ? '300px' : slot === 'rectangle' ? '250px' : '90px' }}
      >
        <span className="text-zinc-700 text-sm">Ad placement</span>
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      <ins
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
          minHeight: slot === 'skyscraper' ? '300px' : slot === 'rectangle' ? '250px' : '90px',
        }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
        data-ad-slot={SLOT_IDS[slot]}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create SidebarAds component**

Create `src/components/ads/SidebarAds.tsx` — wraps rectangle above skyscraper for sidebar placement.

```tsx
// src/components/ads/SidebarAds.tsx
import { AdBanner } from './AdBanner';

export function SidebarAds() {
  return (
    <div className="flex flex-col gap-4">
      <AdBanner slot="rectangle" />
      <AdBanner slot="skyscraper" />
    </div>
  );
}
```

- [ ] **Step 4: Add env vars to .env.local.example**

Modify `.env.local.example` — add AdSense variables at the end.

```
# Google AdSense
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD=XXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_RECTANGLE=XXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR=XXXXXX
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ads/AdSenseScript.tsx src/components/ads/AdBanner.tsx src/components/ads/SidebarAds.tsx .env.local.example
git commit -m "feat: add AdSense component foundation"
```

---

## Chunk 2: Layout Integration

**Files:**
- Modify: `src/app/layout.tsx` — add AdSenseScript to root layout
- Test: manual — check no script errors in browser console

- [ ] **Step 1: Add AdSenseScript to root layout**

Modify `src/app/layout.tsx` — import and render `<AdSenseScript />` inside the body (before children).

```tsx
import { AdSenseScript } from '@/components/ads/AdSenseScript';

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        <AdSenseScript />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: inject AdSense script globally in layout"
```

---

## Chunk 3: Homepage Ads

**Files:**
- Modify: `src/app/page.tsx` — add leaderboard above main content, sidebar in grid
- Test: visually verify ad containers render in correct positions

- [ ] **Step 1: Add imports and layout structure to homepage**

Modify `src/app/page.tsx` — add `AdBanner` import and restructure the main grid area to include a right sidebar column.

Current homepage main area:
```tsx
<main className="max-w-6xl mx-auto px-4 py-8">
```

Replace with:
```tsx
import { AdBanner } from '@/components/ads/AdBanner';
import { SidebarAds } from '@/components/ads/SidebarAds';

// In the component JSX, replace the main content area:
<main className="max-w-6xl mx-auto px-4 py-8">
  {/* Leaderboard ad */}
  <AdBanner slot="leaderboard" className="mb-6" />

  <div className="mb-8">
    ...
  </div>

  <div className="mb-6">
    <FilterBar />
  </div>

  {/* Main content + sidebar grid */}
  <div className="grid gap-6" style="grid-template-columns: 1fr 300px;">
    <div>
      <div className={layout === "grid"
        ? "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid gap-4 grid-cols-1"
      }>
        {/* server cards */}
      </div>
      {/* pagination */}
    </div>
    <div className="hidden lg:block">
      <SidebarAds />
    </div>
  </div>
</main>
```

Note: the existing `max-w-6xl mx-auto px-4` constrains the layout width. The sidebar should appear inside that container. If the server grid was already using a 3-column responsive grid, you'll need to change the server grid to `lg:grid-cols-2` (2 cols instead of 3) to make room for the 300px sidebar.

Also note: `grid-template-columns: 1fr 300px` on an inline style for the outer grid. The server cards grid inside the left column uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add ads to homepage"
```

---

## Chunk 4: Server Detail Page

**Files:**
- Read: `src/app/servers/[ip]/page.tsx`
- Modify: `src/app/servers/[ip]/page.tsx` — add leaderboard + sidebar
- Test: navigate to `/servers/example.com` and verify ads appear

- [ ] **Step 1: Read server detail page**

Read `src/app/servers/[ip]/page.tsx` to understand its current structure before modifying.

- [ ] **Step 2: Add ads to server detail page**

Add the same pattern as homepage: `AdBanner slot="leaderboard"` near the top, `SidebarAds` in a right sidebar column within the constrained container.

- [ ] **Step 3: Commit**

```bash
git add src/app/servers/[ip]/page.tsx
git commit -m "feat: add ads to server detail page"
```

---

## Chunk 5: Top Page Ads

**Files:**
- Read: `src/app/top/page.tsx`
- Modify: `src/app/top/page.tsx` — add leaderboard + sidebar
- Test: navigate to `/top` and verify ads appear

- [ ] **Step 1: Read top page**

Read `src/app/top/page.tsx` to understand its current structure.

- [ ] **Step 2: Add ads to top page**

Same pattern: leaderboard below page heading, sidebar grid with server list on left and `SidebarAds` on right.

- [ ] **Step 3: Commit**

```bash
git add src/app/top/page.tsx
git commit -m "feat: add ads to top page"
```

---

## Chunk 6: Submit/Verify Pages (Footer Banner)

**Files:**
- Read: `src/app/submit/page.tsx`
- Read: `src/app/submit/verify/[id]/page.tsx`
- Modify: both pages — add footer banner only
- Test: verify footer banner appears on submit page and verify page

- [ ] **Step 1: Read submit and verify pages**

Read both files to understand their structure.

- [ ] **Step 2: Add footer banner to submit page**

Add `<AdBanner slot="footer" className="mt-8" />` at the bottom of the form area, before the footer element.

- [ ] **Step 3: Add footer banner to verify page**

Same pattern — add footer banner at bottom of the page content.

- [ ] **Step 4: Commit**

```bash
git add src/app/submit/page.tsx "src/app/submit/verify/[id]/page.tsx"
git commit -m "feat: add footer ads to submit and verify pages"
```

---

## Chunk 7: Spec Review & Final Verification

- [ ] **Step 1: Review spec against all implementations**

Read `docs/superpowers/specs/2026-04-04-adsense-design.md` and verify:
- All pages have correct ad placements
- `AdBanner` handles missing env vars gracefully (empty placeholder)
- Responsive behavior is correct
- No duplicate ad script loading

- [ ] **Step 2: Final commit**

If everything looks correct, commit all remaining changes.

---

## Files Modified Summary

```
CREATED:
  src/components/ads/AdBanner.tsx
  src/components/ads/SidebarAds.tsx
  src/components/ads/AdSenseScript.tsx

MODIFIED:
  .env.local.example
  src/app/layout.tsx
  src/app/page.tsx
  src/app/servers/[ip]/page.tsx
  src/app/top/page.tsx
  src/app/submit/page.tsx
  src/app/submit/verify/[id]/page.tsx
```
