# GuildPost Rebrand v2.0

## Overview

Complete visual refresh to position GuildPost as a **modern, gaming-focused server discovery platform**.

---

## What's New

### 🎨 Color Palette Upgrade

| Old | New | Usage |
|-----|-----|-------|
| `#00f5d4` Teal | `#00d9ff` Electric Cyan | Primary accent |
| `#ff3864` Pink | `#ff006e` Neon Pink | Secondary accent |
| `#6366f1` Indigo | `#8338ec` Electric Purple | Tertiary accent |
| `#0a0a0f` | `#0a0f1c` Deep Navy | Background |

### 🔤 New Logo
- **Type:** Inline SVG (no external images)
- **Icon:** Network nodes with electric cyan connections, pink center hub
- **Wordmark:** "GuildPost" in Space Grotesk Bold
- **Colors:** Cyan `#00d9ff`, Pink `#ff006e`, White `#ffffff`

**Files:**
- `public/logo-guildpost-new.svg` — Full logo
- `public/logo-icon-new.svg` — App icon version
- Header component — Embedded inline SVG (no HTTP requests)

### 🌈 Visual Effects
- **Glow shadows:** `box-shadow: 0 0 30px -5px rgba(0, 217, 255, 0.4)`
- **Gradient text:** `background-image: linear-gradient(135deg, #00d9ff 0%, #8338ec 100%)`
- **Radial backgrounds:** Subtle glow orbs behind hero content
- **Glass morphism:** `backdrop-filter: blur(10px)` on cards

---

## Updated Files

### Design System
| File | Changes |
|------|---------|
| `public/theme.css` | New color variables, gradients, glow shadows |
| `tailwind.config.js` | Updated color tokens, animations |
| `src/styles/global.css` | Preserved (uses CSS vars from theme.css) |

### Components
| File | Changes |
|------|---------|
| `src/components/Header.astro` | New inline SVG logo |
| `src/pages/index.astro` | Refreshed hero with glow effects, gradient text |

### New Assets
| File | Purpose |
|------|---------|
| `public/logo-guildpost-new.svg` | Logo for external use |
| `public/logo-icon-new.svg` | App icon (64×64 style) |
| `public/og-image.svg` | OpenGraph template (1200×630) |
| `public/twitter-header.svg` | Twitter/X header (1500×500) |

### Brand Guidelines
| File | Purpose |
|------|---------|
| `media-pack/REBRAND-v2.md` | This file |
| `media-pack/README.md` | Quick reference |
| `media-pack/ASSET-INVENTORY.md` | Complete asset list |

---

## Deployment

Since Cloudflare Pages auto-deploys from GitHub:

```bash
cd ~/projects/guildpost
git add -A
git commit -m "rebrand: v2.0 modern gaming aesthetic

- New electric color palette (cyan, pink, purple)
- Inline SVG logo system
- Refreshed homepage with glow effects
- Updated theme.css with gradients and glow shadows
- New brand assets in public/ and media-pack/"
git push origin main
```

Cloudflare will auto-deploy within ~1 minute.

---

## Brand Messaging (Updated)

### Before
- "PvP, Survival, Skyblock, Factions & more"
- "Minecraft, Rust, CS2 Server List"
- "server list" (limiting)

### After
- "Survival, SMP, Skyblock, Factions & more"
- "Discover Game Servers | Minecraft, Rust & More"
- "server discovery" (broader, modern)

---

## Color Reference

```css
/* Primary Palette */
--brand-cyan: #00d9ff;
--brand-pink: #ff006e;
--brand-purple: #8338ec;

/* Backgrounds */
--bg-primary: #0a0f1c;
--bg-secondary: #111827;
--bg-tertiary: #1e293b;

/* Text */
--text-primary: #f8fafc;
--text-secondary: #94a3b8;

/* Gradients */
--gradient-primary: linear-gradient(135deg, #00d9ff 0%, #8338ec 100%);
--gradient-secondary: linear-gradient(135deg, #ff006e 0%, #8338ec 100%);
```

---

## Social Media Specs

### OpenGraph (1200×630)
- Use `public/og-image.svg`
- Convert to PNG for production
- Electric cyan accents on dark navy

### Twitter/X Header (1500×500)
- Use `public/twitter-header.svg`
- Logo left, text left-aligned
- Grid pattern overlay

### Favicon
- Use `public/logo-icon-new.svg`
- Scales to all sizes

---

## Future Improvements

- [ ] Convert OG/Twitter SVGs to PNG via GitHub Action
- [ ] Add animated logo (Lottie)
- [ ] Create themed variants (Cyber, Synthwave)
- [ ] Generate social post templates

---

*Rebrand completed: April 2025*
