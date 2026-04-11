// SEO Utility Functions for GuildPost

// Generate meta title with consistent formatting
export function generateTitle(title: string, suffix: string = 'GuildPost'): string {
  if (title === suffix) return title;
  return `${title} | ${suffix}`;
}

// Generate meta description with optimal length (150-160 chars)
export function generateDescription(base: string, extra?: string): string {
  const maxLength = 160;
  let description = base;
  
  if (extra) {
    description = `${base} ${extra}`;
  }
  
  if (description.length > maxLength) {
    description = description.substring(0, maxLength - 3) + '...';
  }
  
  return description;
}

// Generate keywords string from array
export function generateKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

// Generate breadcrumb items for a page
export function generateBreadcrumbs(path: { name: string; url: string }[]): any[] {
  const base = { name: 'Home', url: 'https://guildpost.tech' };
  return [base, ...path];
}

// Generate canonical URL
export function generateCanonical(path: string): string {
  const base = 'https://guildpost.tech';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

// SEO-optimized category descriptions
export const categoryDescriptions: Record<string, string> = {
  'pvp': 'Find the best PvP Minecraft servers. Play KitPvP, Bedwars, Factions, and competitive multiplayer game modes. Live player counts and voting.',
  'survival': 'Discover top Survival Minecraft servers. Vanilla, SMP, and enhanced survival experiences with active communities. Updated daily with live stats.',
  'skyblock': 'Browse Skyblock Minecraft servers. Start on a floating island and build your empire. Find the best Skyblock servers with custom features.',
  'factions': 'Find competitive Factions Minecraft servers. Build, raid, and conquer with your team. Top faction servers with rankings and rewards.',
  'smp': 'Join the best SMP Minecraft servers. Survival Multiplayer with active communities, economies, and vanilla gameplay. Find your new home server.',
  'minigames': 'Play Minecraft minigames on the best servers. Bedwars, Skywars, Hide and Seek, and hundreds of mini games. Quick matches, endless fun.',
  'prison': 'Discover Prison Minecraft servers. Mine, rank up, and build your way to freedom. Find servers with custom enchantments and economies.',
  'bedwars': 'Find the best Bedwars Minecraft servers. Build your base, destroy enemy beds, and be the last team standing. Competitive PvP action.',
  'lifesteal': 'Play on LifeSteal Minecraft servers. Steal hearts from other players to extend your life. Hardcore PvP with a twist.',
  'kitpvp': 'Join KitPvP Minecraft servers for instant combat action. Pre-made kits, ranked matches, and competitive PvP gameplay.',
  'creative': 'Find Creative Minecraft servers with large plots, world edit, and building contests. Showcase your architectural skills.',
  'hardcore': 'Survive on Hardcore Minecraft servers. One life, no respawns. Test your skills on the most challenging servers.',
  'anarchy': 'Play on Anarchy Minecraft servers with no rules, no admins, and complete freedom. True vanilla survival experience.',
  'rpg': 'Discover RPG Minecraft servers with quests, classes, skills, and immersive storylines. Level up and adventure with friends.',
  'modded': 'Find Modded Minecraft servers. FTB, Tekkit, Pixelmon, and custom modpacks. Install mods and join specialized communities.',
  'pixelmon': 'Play Pixelmon Minecraft servers. Pokemon in Minecraft - catch, train, and battle with your favorite Pokemon.',
  'economy': 'Join Economy Minecraft servers with player shops, auctions, and trading. Build wealth and run your own business.',
  'towny': 'Find Towny Minecraft servers. Create towns, form nations, and engage in diplomacy. Civilization-building in Minecraft.',
  'roleplay': 'Discover Roleplay Minecraft servers. Immersive RP experiences with lore, character creation, and story-driven gameplay.',
  'bedrock': 'Find Minecraft Bedrock Edition servers compatible with consoles, mobile, and Windows 10. Cross-platform multiplayer.',
  'cross-play': 'Discover Cross-Play Minecraft servers supporting both Java and Bedrock editions. Play with friends on any platform.'
};

// Generate Open Graph image URL with server count
export function generateOGImage(category?: string): string {
  // Default OG image
  return 'https://guildpost.tech/og-image-new.png';
}

// Pagination meta tags helper
export function generatePaginationMeta(
  currentPage: number,
  totalPages: number,
  baseUrl: string
): { prev?: string; next?: string } {
  const meta: { prev?: string; next?: string } = {};
  
  if (currentPage > 1) {
    const prevPage = currentPage - 1;
    meta.prev = prevPage === 1 ? baseUrl : `${baseUrl}?page=${prevPage}`;
  }
  
  if (currentPage < totalPages) {
    meta.next = `${baseUrl}?page=${currentPage + 1}`;
  }
  
  return meta;
}

// Image alt text generator
export function generateImageAlt(type: string, name?: string, context?: string): string {
  switch (type) {
    case 'server-icon':
      return `${name || 'Minecraft server'} icon and logo`;
    case 'server-banner':
      return `${name || 'Minecraft server'} promotional banner - ${context || 'game server details'}`;
    case 'category':
      return `Minecraft ${name} servers category - browse ${context || 'top multiplayer servers'}`;
    case 'logo':
      return 'GuildPost - Game Server Discovery Platform logo';
    case 'og-image':
      return 'GuildPost - Discover your next favorite Minecraft, Rust, or CS2 multiplayer server';
    default:
      return context || name || 'Image';
  }
}

// Check if a URL is external (for SEO link handling)
export function isExternalUrl(url: string): boolean {
  return url.startsWith('http') && !url.includes('guildpost.tech');
}

// Generate robots meta directive
export function generateRobotsMeta(
  index: boolean = true,
  follow: boolean = true,
  nocache: boolean = false
): string {
  const directives = [];
  if (!index) directives.push('noindex');
  if (!follow) directives.push('nofollow');
  if (nocache) directives.push('nocache');
  
  return directives.length > 0 ? directives.join(', ') : 'index, follow';
}
