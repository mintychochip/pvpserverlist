import type { APIRoute } from 'astro';

// Static pages with their priorities and change frequencies
const staticPages = [
  { url: '/', priority: 1.0, changefreq: 'daily' },
  { url: '/minecraft', priority: 0.9, changefreq: 'hourly' },
  { url: '/submit', priority: 0.7, changefreq: 'monthly' },
  { url: '/search', priority: 0.6, changefreq: 'weekly' },
  { url: '/stats', priority: 0.6, changefreq: 'daily' },
  { url: '/blog', priority: 0.6, changefreq: 'weekly' },
  { url: '/help', priority: 0.5, changefreq: 'monthly' },
  { url: '/privacy', priority: 0.4, changefreq: 'yearly' },
  { url: '/dmca', priority: 0.4, changefreq: 'yearly' },
];

// Valid server categories
const categories = [
  'pvp', 'survival', 'skyblock', 'factions', 'smp', 'minigames',
  'prison', 'bedwars', 'lifesteal', 'kitpvp', 'creative', 'hardcore',
  'anarchy', 'rpg', 'modded', 'pixelmon', 'economy', 'towny', 'roleplay',
  'bedrock', 'cross-play'
];

export const GET: APIRoute = async () => {
  const baseUrl = 'https://guildpost.tech';
  
  try {
    // Fetch all servers from Supabase for dynamic URLs
    const supabaseUrl = 'https://wpxutsdbiampnxfgkjwq.supabase.co';
    const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';
    
    let serverUrls: string[] = [];
    
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/servers?select=id,updated_at,last_ping_at&limit=1000`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      
      if (response.ok) {
        const servers = await response.json();
        serverUrls = servers.map((server: any) => ({
          id: server.id,
          lastmod: server.last_ping_at || server.updated_at || new Date().toISOString()
        }));
      }
    } catch (e) {
      console.error('Failed to fetch servers for sitemap:', e);
    }

    // Generate sitemap XML
    const sitemapEntries: string[] = [];
    
    // Add static pages
    for (const page of staticPages) {
      sitemapEntries.push(`
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`);
    }
    
    // Add category pages
    for (const category of categories) {
      sitemapEntries.push(`
  <url>
    <loc>${baseUrl}/category/${category}</loc>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }
    
    // Add server detail pages
    for (const server of serverUrls) {
      const lastmod = typeof server === 'object' ? server.lastmod : new Date().toISOString();
      const id = typeof server === 'object' ? server.id : server;
      
      sitemapEntries.push(`
  <url>
    <loc>${baseUrl}/servers/${id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join('')}
</urlset>`;

    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });
    
  } catch (error) {
    console.error('Sitemap generation error:', error);
    
    // Return basic sitemap on error
    const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`).join('')}
</urlset>`;

    return new Response(fallbackSitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }
};
