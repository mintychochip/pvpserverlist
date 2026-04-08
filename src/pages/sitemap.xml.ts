import type { APIRoute } from 'astro';

const SITE_URL = 'https://guildpost.tech';

// Static pages
const staticPages = [
  '',
  '/minecraft',
  '/submit',
  '/dashboard',
  '/premium',
  '/banner-maker',
  '/stats',
  '/help',
  '/contact',
  '/status',
  '/terms',
  '/privacy',
  '/dmca',
];

// Server categories
const categories = [
  'Survival', 'SMP', 'PvP', 'Skyblock', 'Factions',
  'Prison', 'Minigames', 'Creative', 'Hardcore',
  'Anarchy', 'RPG', 'Modded', 'Pixelmon'
];

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  
  let serverUrls: string[] = [];
  
  // Fetch all servers if we have DB access
  if (supabaseKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/servers?select=id,updated_at&limit=10000`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
      );
      
      if (response.ok) {
        const servers = await response.json();
        serverUrls = servers.map((s: any) => `/servers/${s.id}`);
      }
    } catch (err) {
      console.error('Sitemap: Failed to fetch servers:', err);
    }
  }
  
  // Build sitemap XML
  const urls = [
    // Static pages
    ...staticPages.map(path => ({
      loc: `${SITE_URL}${path}`,
      changefreq: path === '' ? 'daily' : 'weekly',
      priority: path === '' ? '1.0' : '0.8',
    })),
    
    // Category pages
    ...categories.map(cat => ({
      loc: `${SITE_URL}/minecraft/${cat.toLowerCase()}`,
      changefreq: 'daily',
      priority: '0.7',
    })),
    
    // Server pages
    ...serverUrls.map(path => ({
      loc: `${SITE_URL}${path}`,
      changefreq: 'hourly',
      priority: '0.6',
    })),
  ];
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
