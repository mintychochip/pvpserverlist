import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const GET: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';
  const size = url.searchParams.get('size') || 'medium';
  const theme = url.searchParams.get('theme') || 'dark';
  const branding = url.searchParams.get('branding') !== 'false';

  if (!id) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fetch server data with status
  const { data: server, error } = await supabase
    .from('servers')
    .select(`
      *,
      server_status (
        online,
        players_online,
        players_max,
        latency_ms,
        updated_at
      )
    `)
    .eq('id', id)
    .single();

  if (error || !server) {
    return new Response(JSON.stringify({ error: 'Server not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const status = server.server_status?.[0] || {};
  const isOnline = status.online === true;
  const playerCount = status.players_online || 0;
  const maxPlayers = status.players_max || 0;
  const latency = status.latency_ms || 0;

  // Format: JSON API
  if (format === 'json') {
    return new Response(JSON.stringify({
      id: server.id,
      name: server.name,
      ip: server.ip,
      port: server.port,
      status: isOnline ? 'online' : 'offline',
      players: {
        online: playerCount,
        max: maxPlayers
      },
      latency: latency,
      votes: server.vote_count || 0,
      description: server.description,
      tags: server.tags || [],
      version: server.version,
      updated_at: status.updated_at
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  }

  // Format: HTML widget (iframe embed)
  if (format === 'html') {
    const dimensions = getDimensions(size);
    const html = generateWidgetHTML(server, status, theme, branding, dimensions);
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=30'
      }
    });
  }

  // Format: PNG image (dynamic banner)
  if (format === 'png') {
    const svg = generateBannerSVG(server, status, theme, size);
    
    // Convert SVG to PNG using sharp if available, or return SVG with PNG content-type
    // For now, return SVG which browsers can render as image
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=60'
      }
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid format' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
};

function getDimensions(size: string): { width: number; height: number } {
  switch (size) {
    case 'small': return { width: 240, height: 120 };
    case 'large': return { width: 380, height: 160 };
    case 'medium':
    default: return { width: 300, height: 140 };
  }
}

function generateWidgetHTML(
  server: any,
  status: any,
  theme: string,
  branding: boolean,
  dimensions: { width: number; height: number }
): string {
  const isOnline = status.online === true;
  const playerCount = status.players_online || 0;
  const maxPlayers = status.players_max || 0;
  const voteCount = server.vote_count || 0;
  
  const isDark = theme === 'dark';
  const bgColor = isDark ? '#12121a' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#1a1a2e';
  const mutedColor = isDark ? '#8892b0' : '#666666';
  const accentColor = '#00f5d4';
  const onlineColor = '#00f5d4';
  const offlineColor = '#ff3864';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bgColor};
      color: ${textColor};
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .widget {
      flex: 1;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${isOnline ? onlineColor : offlineColor};
      box-shadow: 0 0 6px ${isOnline ? onlineColor : offlineColor}40;
    }
    .server-name {
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .stats {
      display: flex;
      gap: 16px;
      margin-bottom: 8px;
    }
    .stat {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
    }
    .stat-value {
      font-weight: 700;
      color: ${accentColor};
    }
    .stat-label {
      color: ${mutedColor};
      font-size: 11px;
    }
    .player-bar {
      height: 4px;
      background: ${isDark ? '#2a2a3a' : '#e0e0e0'};
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .player-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, ${accentColor}, ${onlineColor});
      width: ${maxPlayers > 0 ? Math.round((playerCount / maxPlayers) * 100) : 0}%;
      transition: width 0.3s ease;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: ${mutedColor};
    }
    .brand {
      display: ${branding ? 'flex' : 'none'};
      align-items: center;
      gap: 4px;
      color: ${accentColor};
      text-decoration: none;
      font-weight: 600;
    }
    .latency {
      font-size: 10px;
    }
    @media (max-width: 280px) {
      .stats { gap: 12px; }
      .stat { font-size: 12px; }
    }
  </style>
</head>
<body>
  <div class="widget">
    <div class="header">
      <div class="status-dot"></div>
      <div class="server-name">${escapeHtml(server.name)}</div>
    </div>
    
    <div class="player-bar">
      <div class="player-bar-fill"></div>
    </div>
    
    <div class="stats">
      <div class="stat">
        <span class="stat-value">${playerCount.toLocaleString()}</span>
        <span class="stat-label">/ ${maxPlayers.toLocaleString()} players</span>
      </div>
      <div class="stat">
        <span class="stat-value">${voteCount.toLocaleString()}</span>
        <span class="stat-label">votes</span>
      </div>
    </div>
    
    <div class="footer">
      <a href="https://guildpost.tech/servers/${server.id}" target="_blank" class="brand">
        GuildPost
      </a>
      <span class="latency">${status.latency_ms || 0}ms</span>
    </div>
  </div>
  
  <script>
    // Auto-refresh every 5 minutes
    setTimeout(() => location.reload(), 5 * 60 * 1000);
  </script>
</body>
</html>`;
}

function generateBannerSVG(
  server: any,
  status: any,
  theme: string,
  size: string
): string {
  const isOnline = status.online === true;
  const playerCount = status.players_online || 0;
  const maxPlayers = status.players_max || 0;
  const voteCount = server.vote_count || 0;
  
  const dimensions = getDimensions(size);
  const isDark = theme === 'dark';
  
  const bgColor = isDark ? '#12121a' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#1a1a2e';
  const mutedColor = isDark ? '#8892b0' : '#666666';
  const accentColor = '#00f5d4';
  const onlineColor = '#00f5d4';
  const offlineColor = '#ff3864';
  const statusColor = isOnline ? onlineColor : offlineColor;
  
  const barWidth = dimensions.width - 32;
  const fillWidth = maxPlayers > 0 ? Math.round((playerCount / maxPlayers) * barWidth) : 0;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="barGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${accentColor}"/>
      <stop offset="100%" style="stop-color:${onlineColor}"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="${bgColor}"/>
  
  <!-- Border -->
  <rect x="1" y="1" width="${dimensions.width - 2}" height="${dimensions.height - 2}" 
        fill="none" stroke="${accentColor}" stroke-width="2" rx="8"/>
  
  <!-- Status dot -->
  <circle cx="16" cy="20" r="4" fill="${statusColor}">
    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
  </circle>
  
  <!-- Server name -->
  <text x="28" y="24" fill="${textColor}" font-family="system-ui, sans-serif" font-size="14" font-weight="700">
    ${escapeXml(server.name)}
  </text>
  
  <!-- Player bar background -->
  <rect x="16" y="${dimensions.height - 60}" width="${barWidth}" height="4" fill="${isDark ? '#2a2a3a' : '#e0e0e0'}" rx="2"/>
  
  <!-- Player bar fill -->
  <rect x="16" y="${dimensions.height - 60}" width="${fillWidth}" height="4" fill="url(#barGradient)" rx="2"/>
  
  <!-- Player count -->
  <text x="16" y="${dimensions.height - 32}" fill="${accentColor}" font-family="system-ui, sans-serif" font-size="16" font-weight="700">
    ${playerCount.toLocaleString()}
  </text>
  <text x="${playerCount.toLocaleString().length * 10 + 20}" y="${dimensions.height - 32}" fill="${mutedColor}" font-family="system-ui, sans-serif" font-size="12">
    / ${maxPlayers.toLocaleString()} players
  </text>
  
  <!-- Votes -->
  <text x="${dimensions.width - 16}" y="${dimensions.height - 32}" fill="${mutedColor}" font-family="system-ui, sans-serif" font-size="12" text-anchor="end">
    ${voteCount.toLocaleString()} votes
  </text>
  
  <!-- GuildPost branding -->
  <text x="${dimensions.width - 16}" y="${dimensions.height - 12}" fill="${accentColor}" font-family="system-ui, sans-serif" font-size="10" font-weight="600" text-anchor="end">
    GuildPost
  </text>
</svg>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
