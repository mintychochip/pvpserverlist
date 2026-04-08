import type { APIRoute } from 'astro';

const SITE_URL = 'https://guildpost.tech';

// Generate RSS feeds for servers at build time
export async function getStaticPaths() {
  // Return empty - these will be generated on-demand by Cloudflare Functions
  return [];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Server {
  id: string;
  name: string;
  description: string;
  ip: string;
  port: number;
  tags: string[];
  vote_count: number;
  players_online: number;
  max_players: number;
  status: string;
  created_at: string;
  website?: string;
  icon?: string;
  banner?: string;
  edition?: string;
  verified?: boolean;
  claimed?: boolean;
}

interface ServerPost {
  id: string;
  server_id: string;
  title: string;
  content: string;
  summary?: string;
  author: string;
  category: string;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at?: string;
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRssDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toUTCString();
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    'news': '📰 News',
    'update': '🔄 Update',
    'patch': '📋 Patch Notes',
    'event': '🎉 Event',
    'announcement': '📢 Announcement',
    'other': '📝 Other'
  };
  return labels[category] || category;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { id } = params;
  
  if (!id) {
    return new Response('Server ID required', {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
  
  const env = (locals as any)?.runtime?.env || {};
  const supabaseUrl = env.SUPABASE_URL || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  
  if (!supabaseKey) {
    return new Response('Service unavailable', {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
  
  try {
    // Fetch server details
    const serverResponse = await fetch(
      `${supabaseUrl}/rest/v1/servers?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
    );
    
    if (!serverResponse.ok) {
      throw new Error(`Supabase error: ${await serverResponse.text()}`);
    }
    
    const servers: Server[] = await serverResponse.json();
    
    if (!servers || servers.length === 0) {
      return new Response('Server not found', {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
    
    const server = servers[0];
    
    // Fetch server posts (news, updates, etc.)
    const postsResponse = await fetch(
      `${supabaseUrl}/rest/v1/server_posts?server_id=eq.${encodeURIComponent(id)}&is_published=eq.true&order=published_at.desc&limit=20`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }}
    );
    
    let posts: ServerPost[] = [];
    if (postsResponse.ok) {
      posts = await postsResponse.json();
    }
    
    const serverUrl = `${SITE_URL}/servers/${server.id}`;
    const pubDate = posts.length > 0 
      ? formatRssDate(posts[0].published_at) 
      : formatRssDate(server.created_at);
    
    // Build channel description
    let channelDescription = `News, updates, and announcements from ${server.name}`;
    if (server.description) {
      channelDescription += `. ${server.description.slice(0, 100)}${server.description.length > 100 ? '...' : ''}`;
    }
    
    // Generate items from posts
    let items = '';
    
    if (posts.length > 0) {
      items = posts.map(post => {
        const postUrl = `${serverUrl}#post-${post.id}`;
        const title = escapeXml(post.title);
        
        // Build description
        let description = '';
        if (post.summary) {
          description += escapeXml(post.summary);
        } else if (post.content) {
          // Strip markdown-like formatting for plain text preview
          const plainContent = post.content
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/`{3}[\s\S]*?`{3}/g, '[code block]')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
            .slice(0, 300);
          description += escapeXml(plainContent);
          if (post.content.length > 300) {
            description += '...';
          }
        }
        
        description += `<br/><br/><a href="${postUrl}">Read more on GuildPost →</a>`;
        
        const categories = [post.category];
        if (post.is_pinned) {
          categories.unshift('pinned');
        }
        
        return `    <item>
      <title>${post.is_pinned ? '📌 ' : ''}${categoryLabel(post.category)}: ${title}</title>
      <description><![CDATA[${description}]]></description>
      <link>${postUrl}</link>
      <guid isPermaLink="false">post-${post.id}-${new Date(post.published_at).getTime()}</guid>
      <pubDate>${formatRssDate(post.published_at)}</pubDate>
      <author>${escapeXml(post.author || 'Server Admin')}</author>
      ${categories.map(cat => `<category>${escapeXml(cat)}</category>`).join('\n      ')}
    </item>`;
      }).join('\n');
    }
    
    // Add a "server listed" item as fallback if no posts
    if (posts.length === 0) {
      let serverInfo = `Welcome to ${escapeXml(server.name)}!`;
      if (server.description) {
        serverInfo += `<br/><br/>${escapeXml(server.description)}`;
      }
      
      const details: string[] = [];
      if (server.ip) {
        details.push(`🎮 ${escapeXml(server.ip)}:${server.port || 25565}`);
      }
      if (server.players_online !== undefined) {
        details.push(`👥 ${server.players_online} players online`);
      }
      if (server.vote_count) {
        details.push(`⭐ ${server.vote_count} votes`);
      }
      if (server.tags && server.tags.length > 0) {
        details.push(`🏷️ ${server.tags.join(', ')}`);
      }
      
      if (details.length > 0) {
        serverInfo += `<br/><br/>${details.join('<br/>')}`;
      }
      
      serverInfo += `<br/><br/><a href="${serverUrl}">View server on GuildPost →</a>`;
      
      items = `    <item>
      <title>Server Listed: ${escapeXml(server.name)}</title>
      <description><![CDATA[${serverInfo}]]></description>
      <link>${serverUrl}</link>
      <guid isPermaLink="true">${serverUrl}</guid>
      <pubDate>${formatRssDate(server.created_at)}</pubDate>
      ${server.tags?.map(tag => `<category>${escapeXml(tag)}</category>`).join('\n      ') || ''}
    </item>`;
    }
    
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(server.name)} - GuildPost Server Feed</title>
    <description>${escapeXml(channelDescription)}</description>
    <link>${serverUrl}</link>
    <atom:link href="${SITE_URL}/rss/servers/${server.id}.xml" rel="self" type="application/rss+xml" />
    <language>en-us</language>
    <pubDate>${pubDate}</pubDate>
    <lastBuildDate>${formatRssDate(new Date().toISOString())}</lastBuildDate>
    ${server.icon ? `<image>
      <url>${escapeXml(server.icon)}</url>
      <title>${escapeXml(server.name)}</title>
      <link>${serverUrl}</link>
    </image>` : ''}
${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
    
  } catch (err: any) {
    console.error('Server RSS feed error:', err);
    return new Response('Failed to generate RSS feed', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};
