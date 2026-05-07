# GuildPost

<p align="center">
  <img src="https://img.shields.io/badge/Astro-6.2-black?style=flat-square&logo=astro&color=BC52EE" alt="Astro">
  <img src="https://img.shields.io/badge/Cloudflare-SSR-orange?style=flat-square&logo=cloudflare&color=F38020" alt="Cloudflare">
  <img src="https://img.shields.io/badge/Tailwind-3.4-blue?style=flat-square&logo=tailwindcss&color=06B6D4" alt="Tailwind">
  <img src="https://img.shields.io/badge/Supabase-Database-green?style=flat-square&logo=supabase&color=3ECF8E" alt="Supabase">
  <img src="https://img.shields.io/badge/Gemini-AI-purple?style=flat-square&logo=google&color=4285F4" alt="Gemini AI">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

<p align="center">
  <strong>Find Your Server. The ultimate directory for game servers.</strong>
</p>

<p align="center">
  <a href="https://guildpost.tech">Live Demo</a> •
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#development">Development</a>
</p>

---

## Features

- **Server Discovery** — Browse 2,000+ Minecraft servers with advanced search and filtering
- **Live Status** — Real-time player counts, latency checks, and online/offline status
- **Community Rankings** — Vote-based server rankings with no pay-to-win placement
- **Game Categories** — Support for Minecraft (PvP, Survival, Skyblock, Factions, SMP)
- **Trending Servers** — See what's hot with daily trending and recently added servers
- **Responsive Design** — Optimized for desktop, tablet, and mobile
- **Cyberpunk Aesthetic** — Dark theme with neon accents and retro-futuristic UI

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | [Astro](https://astro.build) 6.2+ — SSR with Cloudflare adapter |
| **AI** | [Gemini](https://ai.google.dev) + Gemma 4B — Semantic search & chat |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) 3.4+ — Utility-first CSS |
| **Database** | [Supabase](https://supabase.com) — PostgreSQL + Realtime |
| **Icons** | Lucide React |
| **Deployment** | [Cloudflare Pages](https://pages.cloudflare.com) — Edge SSR with Wrangler |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/mintychochip/guildpost.git
cd guildpost

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The site is deployed to Cloudflare Pages with server-side rendering at the edge.

---

## Project Structure

```
guildpost/
├── src/
│   ├── components/     # Reusable Astro components
│   ├── layouts/        # Page layouts
│   ├── pages/          # Route pages
│   └── styles/         # Global styles
├── public/             # Static assets
├── supabase/           # Database schema & migrations
└── package.json
```

---

## Brand Guidelines

| Element | Value |
|---------|-------|
| Background | `#0a0a0f` |
| Primary (Cyan) | `#00f5d4` |
| Secondary (Pink) | `#ff3864` |
| White | `#ffffff` |
| Muted Text | `#a0a0b0` |

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built for the community. Not for profit.
</p>
