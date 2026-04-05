# Google AdSense Integration — Design Spec
**Date:** 2026-04-04
**Topic:** Ad Integration

## Overview

Integrate Google AdSense into PvP Index to monetize the server directory. The site currently has no ads — this adds leaderboard, sidebar rectangle, and skyscraper ad placements across the main pages.

## Ad Formats & Placements

| Page | Leaderboard (728×90) | Sidebar Rectangle (300×250) | Sidebar Skyscraper (160×600) | Footer Banner |
|---|---|---|---|---|
| `/` (home) | ✅ Top of page | ✅ Right sidebar | ✅ Right sidebar | — |
| `/servers/[ip]` | ✅ Top of content | ✅ Right sidebar | ✅ Right sidebar | — |
| `/top` | ✅ Top of content | ✅ Right sidebar | ✅ Right sidebar | — |
| `/submit` | — | — | — | ✅ Bottom of page |
| `/submit/verify/[id]` | — | — | — | ✅ Bottom of page |

**Future pages (no ads for now):** User profile pages, if built.

## Ad Component Architecture

### `AdBanner` Component
A single reusable component wrapping the Google AdSense script.

**Props:**
```typescript
interface AdBannerProps {
  slot: 'leaderboard' | 'rectangle' | 'skyscraper' | 'footer';
  className?: string;
}
```

**Behavior:**
- Loads `adsbygoogle` script dynamically on mount (client component)
- Uses `push` with `lazyLoad: true` for non-blocking ad load
- If AdSense env vars are not set, renders an empty placeholder div (no broken UI)
- Responsive: uses AdSense responsive sizing with `data-full-width-responsive="true"`

### Environment Variables
```
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD=XXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_RECTANGLE=XXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR=XXXXXX
```

### Layout Integration
- Global sidebar ads (rectangle + skyscraper) live in a shared `SidebarAds` component rendered in the root layout on pages that support sidebar ads
- Leaderboard ads are placed inline on each relevant page
- Footer banner only on submit/verify pages

## Pages — Detailed Ad Layout

### Homepage (`src/app/page.tsx`)
- Leaderboard banner directly below the `<header>` and above the main heading
- Server grid uses CSS grid with sidebar: `grid-template-columns: 1fr 280px`
- Sidebar contains rectangle (300×250) stacked above skyscraper (160×600)

### Server Detail Page (`src/app/servers/[ip]/page.tsx`)
- Same sidebar layout as homepage
- Leaderboard below page title, above server info cards

### Top Page (`src/app/top/page.tsx`)
- Same sidebar layout
- Leaderboard above the ranked server list

### Submit / Verify Pages
- No sidebar
- Footer banner only, beneath the form

## AdSense Script Loading
```typescript
// In AdBanner component (client)
useEffect(() => {
  (window.adsbygoogle = window.adsbygoogle || []).push({});
}, []);
```

The script tag `<script async src="https://pagead2.googlesyndication.com/...></script>` is injected once globally in the root layout via a hidden component.

## Fallback State
When `NEXT_PUBLIC_ADSENSE_CLIENT_ID` is not set:
- `AdBanner` renders a styled empty container (bordered box with subtle background)
- No error, no broken layout
- Site functions normally without ads

## Responsiveness
- AdSense responsive ad units auto-size
- On mobile (<768px): sidebar becomes full-width, ads stack vertically
- The grid switches to single-column on mobile naturally via existing Tailwind classes

## File Changes
```
src/components/ads/
  AdBanner.tsx         — Client component, handles ad rendering + lazy load
  SidebarAds.tsx        — Wraps rectangle + skyscraper for sidebar
  AdSenseScript.tsx     — Injects the global adsbygoogle script tag

src/app/layout.tsx     — Add AdSenseScript component

src/app/page.tsx       — Add leaderboard + sidebar grid
src/app/servers/[ip]/page.tsx  — Add leaderboard + sidebar grid
src/app/top/page.tsx   — Add leaderboard + sidebar grid
src/app/submit/page.tsx        — Add footer banner only
src/app/submit/verify/[id]/page.tsx — Add footer banner only
```

## Dependencies
- No new npm packages — AdSense is pure script injection
- `adsbygoogle` is loaded from Google's CDN

## Testing Checklist
- [ ] Ads render correctly when AdSense is configured
- [ ] Empty placeholder shown when AdSense is NOT configured (no broken layout)
- [ ] Leaderboard loads above server content on all target pages
- [ ] Sidebar stacks correctly on mobile
- [ ] Footer banner appears on submit/verify pages only
- [ ] PageSpeed impact — lazy loading doesn't cause CLS (no layout shift from ads)
