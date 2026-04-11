# GuildPost Media Asset Inventory

## Quick Reference

| Asset Type | Count | Location |
|------------|-------|----------|
| Logos | 7 | `../logo/` |
| Icons | 11 | `../icons/` |
| Banners | 6 | `../banners/` |

---

## Logo Assets

### Full Wordmark
| File | Format | Background | Use Case |
|------|--------|------------|----------|
| `logo-dark.svg` | SVG | Transparent | Light/white backgrounds |
| `logo-dark.png` | PNG | Transparent | Light/white backgrounds (raster fallback) |
| `logo-light.svg` | SVG | Transparent | Dark backgrounds |
| `logo-light.png` | PNG | Transparent | Dark backgrounds (raster fallback) |
| `logo.png` | PNG | Original | Legacy reference |
| `logo-new.png` | PNG | Original | Current production logo |
| `logo-specs.svg` | SVG | - | Design specifications |

### Icon/Wordmark Mark
| File | Format | Size | Use Case |
|------|--------|------|----------|
| `logo-icon.svg` | SVG | Vector | App icons, favicon source |
| `logo-icon-180.png` | PNG | 180×180 | Apple touch icon |
| `logo-icon-192.png` | PNG | 192×192 | Android/PWA icon |
| `logo-icon-512.png` | PNG | 512×512 | PWA splash screen |
| `logo-icon-specs.svg` | SVG | - | Icon design specs |

---

## Favicon Assets

| File | Size | Use Case |
|------|------|----------|
| `favicon.svg` | Vector | Modern browsers (scalable) |
| `favicon.png` | 64×64 | General favicon |
| `favicon-16x16.png` | 16×16 | Legacy browser tabs |
| `favicon-32x32.png` | 32×32 | Retina browser tabs |

---

## App/Store Icons

| File | Size | Use Case |
|------|------|----------|
| `icon-1024.png` | 1024×1024 | App Store, Play Store |
| `icon-app.png` | Original | General app icon usage |

---

## Banner/Social Assets

| File | Dimensions | Use Case |
|------|------------|----------|
| `og-image-new.png` | 1200×630 | OpenGraph / social share preview |
| `banner-discord.png` | ~1200×400 | Discord server banner |
| `discord-banner.png` | Larger variant | Discord invite splash |
| `header-twitter.png` | ~1500×500 | Twitter/X profile header |
| `loading-screen.png` | App dimensions | App loading screen |
| `opengraph-specs.svg` | - | OG image design specs |

---

## Usage Matrix

### Website
- `logo-dark.svg` → Header (light mode)
- `logo-light.svg` → Header (dark mode)
- `favicon.svg` → Browser tab
- `og-image-new.png` → Social sharing

### Social Media
- `header-twitter.png` → Twitter/X header
- `banner-discord.png` → Discord banner
- `og-image-new.png` → All link previews

### Mobile/PWA
- `logo-icon-192.png` → Android icon
- `logo-icon-180.png` → Apple touch icon
- `logo-icon-512.png` → PWA splash
- `icon-1024.png` → Store listings

### Print/Merch
- `logo-dark.svg` → T-shirts, stickers (on light)
- `logo-light.svg` → Stickers, dark merchandise

---

## File Organization

```
media-pack/
├── logo/              # Full wordmarks and variants
├── icons/             # Favicons, app icons, icon marks
├── banners/           # Social banners, OG images
├── social/            # Platform-specific templates (to be created)
└── brand-guidelines/  # This documentation
```

---

## Missing Assets (To Create)

- [ ] Twitter/X post templates (1080×1080, 1080×1350, 1080×1920)
- [ ] Instagram post/story templates
- [ ] LinkedIn banner (1584×396)
- [ ] YouTube thumbnail template (1280×720)
- [ ] Email signature template
- [ ] Business card design
- [ ] Animated logo (Lottie or GIF)

---

*Generated: April 2025*
