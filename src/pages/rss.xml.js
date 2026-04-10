import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  
  // Sort by date
  const sortedPosts = posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  
  const items = sortedPosts.map((post) => `
    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${context.site}blog/${post.slug}/</link>
      <guid>${context.site}blog/${post.slug}/</guid>
      <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(post.data.description)}</description>
      <author>${escapeXml(post.data.author)}</author>
      ${post.data.tags.map(tag => `<category>${escapeXml(tag)}</category>`).join('')}
    </item>
  `).join('');
  
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>GuildPost Blog - Minecraft Server Guides &amp; Tips</title>
    <link>${context.site}</link>
    <description>Discover guides, tips, and insights about Minecraft servers, multiplayer gaming, and finding the perfect server community.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
  
  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}
