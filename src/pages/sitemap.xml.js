import { getCollection } from 'astro:content';

export async function GET({ site }) {
  // Get all blog posts
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  
  // Static pages
  const staticPages = [
    '',
    'minecraft',
    'blog',
    'wizard',
    'submit',
    'discover',
    'premium',
    'uptime',
    'about',
    'contact',
    'privacy',
    'terms',
  ];
  
  // Generate sitemap XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  
  <!-- Homepage -->
  <url>
    <loc>${site}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Static Pages -->
  ${staticPages.map(page => `
  <url>
    <loc>${site}${page}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  `).join('')}
  
  <!-- Blog Posts -->
  ${posts.map(post => `
  <url>
    <loc>${site}blog/${post.slug}/</loc>
    <lastmod>${post.data.updatedDate?.toISOString() || post.data.pubDate.toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
    ${post.data.image ? `
    <image:image>
      <image:loc>${site}${post.data.image.replace(/^\//, '')}</image:loc>
      <image:title>${post.data.title}</image:title>
    </image:image>
    ` : ''}
  </url>
  `).join('')}
  
</urlset>`;
  
  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
