// Keys loaded from window.__CONFIG (injected by Layout.astro)
const config = (window as any).__CONFIG || {};
const supabaseUrl = config.supabaseUrl || 'https://wpxutsdbiampnxfgkjwq.supabase.co';
const supabaseKey = config.supabaseKey || '';

// State
let allServers: any[] = [];
let filteredServers: any[] = [];
let currentPage = 1;
const SERVERS_PER_PAGE = 18;
let aiSearchEnabled = false;

// Toast notification helper
function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast-notification fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-y-4 opacity-0`;
  
  const colors = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    warning: 'bg-yellow-500 text-black',
    info: 'bg-[#00f5d4] text-[#0a0a0f]'
  };
  
  toast.className += ` ${colors[type]}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });
  
  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Country flag helper
function getCountryFlag(code: string) {
  const flags: Record<string, string> = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'CA': '🇨🇦',
    'AU': '🇦🇺', 'NL': '🇳🇱', 'SE': '🇸🇪', 'BR': '🇧🇷', 'SG': '🇸🇬',
    'JP': '🇯🇵', 'IN': '🇮🇳', 'RU': '🇷🇺', 'PL': '🇵🇱', 'IT': '🇮🇹'
  };
  return flags[code] || '🌐';
}

// DOM Elements (will be initialized after DOM loads)
let searchInput: HTMLInputElement | null;
let sortSelect: HTMLSelectElement | null;
let statusSelect: HTMLSelectElement | null;
let versionSelect: HTMLSelectElement | null;
let platformSelect: HTMLSelectElement | null;
let countrySelect: HTMLSelectElement | null;
let serversList: HTMLElement | null;
let serverCount: HTMLElement | null;
let paginationInfo: HTMLElement | null;
let pagination: HTMLElement | null;
let prevPageBtn: HTMLElement | null;
let nextPageBtn: HTMLElement | null;
let pageNumbers: HTMLElement | null;
let noResults: HTMLElement | null;
let aiSearchToggle: HTMLElement | null;

async function loadServers() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: servers, error } = await supabase
    .from('servers')
    .select('*')
    .order('vote_count', { ascending: false });
  
  if (error) {
    console.error('Error loading servers:', error);
    if (serversList) {
      serversList.innerHTML = `
        <div class="col-span-full text-center py-16">
          <h3 class="text-xl font-bold text-white mb-2">Failed to load servers</h3>
          <button onclick="location.reload()" class="px-6 py-3 bg-[#ff3864] text-white font-bold rounded-lg">Try Again</button>
        </div>
      `;
    }
    return;
  }
  
  allServers = servers || [];
  filteredServers = [...allServers];
  
  applyFilters();
}

function applyFilters() {
  let results = [...allServers];
  
  const searchTerm = searchInput?.value.toLowerCase().trim();
  if (searchTerm) {
    results = results.filter(s => 
      s.name?.toLowerCase().includes(searchTerm) ||
      s.ip?.toLowerCase().includes(searchTerm) ||
      s.tags?.some((t: string) => t.toLowerCase().includes(searchTerm))
    );
  }
  
  const statusFilter = statusSelect?.value;
  if (statusFilter && statusFilter !== 'all') {
    results = results.filter(s => s.status === statusFilter);
  }
  
  const versionFilter = versionSelect?.value;
  if (versionFilter && versionFilter !== 'all') {
    results = results.filter(s => {
      const v = s.version_normalized || s.version || '';
      return v.startsWith(versionFilter);
    });
  }
  
  const countryFilter = countrySelect?.value;
  if (countryFilter && countryFilter !== 'all') {
    results = results.filter(s => s.country_code === countryFilter);
  }
  
  const platformFilter = platformSelect?.value;
  if (platformFilter && platformFilter !== 'all') {
    results = results.filter(s => {
      const edition = (s.edition || 'java').toLowerCase();
      if (platformFilter === 'crossplay') {
        return edition === 'crossplay' || edition === 'both' || edition === 'java+bedrock';
      }
      return edition === platformFilter;
    });
  }
  
  const sortBy = sortSelect?.value;
  if (sortBy) {
    results.sort((a, b) => {
      switch (sortBy) {
        case 'votes':
          return (b.vote_count || 0) - (a.vote_count || 0);
        case 'players':
          return (b.players_online || 0) - (a.players_online || 0);
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });
  }
  
  filteredServers = results;
  currentPage = 1;
  
  updateDisplay();
}

function updateDisplay() {
  if (serverCount) {
    serverCount.textContent = `(${filteredServers.length.toLocaleString()} found)`;
  }
  
  if (filteredServers.length === 0) {
    if (serversList) serversList.innerHTML = '';
    if (pagination) pagination.classList.add('hidden');
    const noResultsEl = document.getElementById('no-results');
    if (noResultsEl) noResultsEl.classList.remove('hidden');
    return;
  }
  
  const noResultsEl = document.getElementById('no-results');
  if (noResultsEl) noResultsEl.classList.add('hidden');
  
  const totalPages = Math.ceil(filteredServers.length / SERVERS_PER_PAGE);
  const startIndex = (currentPage - 1) * SERVERS_PER_PAGE;
  const endIndex = startIndex + SERVERS_PER_PAGE;
  const pageServers = filteredServers.slice(startIndex, endIndex);
  
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, filteredServers.length)} of ${filteredServers.length}`;
  }
  
  // Render servers
  if (serversList) {
    serversList.innerHTML = pageServers.map(server => {
      const edition = (server.edition || 'java').toLowerCase();
      let platformBadge = '';
      if (edition === 'bedrock') {
        platformBadge = `<span class="px-1.5 py-0.5 bg-[#8b5cf6]/20 text-[#8b5cf6] rounded text-[10px] font-bold">BEDROCK</span>`;
      } else if (edition === 'crossplay' || edition === 'both') {
        platformBadge = `<span class="px-1.5 py-0.5 bg-[#f59e0b]/20 text-[#f59e0b] rounded text-[10px] font-bold">CROSS-PLAY</span>`;
      } else {
        platformBadge = `<span class="px-1.5 py-0.5 bg-[#f59e0b]/20 text-[#f59e0b] rounded text-[10px] font-bold">JAVA</span>`;
      }
      
      return `
      <div class="p-4 bg-[#12121a] border border-[#2a2a3a] hover:border-[#00f5d4] rounded-lg transition-all group">
        <a href="/servers/${server.id}" class="block">
          <div class="flex items-start gap-3">
            <div class="relative w-12 h-12 bg-[#1a1a25] rounded-lg flex items-center justify-center flex-shrink-0">
              ${server.icon ? 
                `<img src="${server.icon}" alt="" class="w-full h-full object-cover rounded-lg" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="text-[#00f5d4] text-xl hidden absolute inset-0 items-center justify-center">⛏</span>` : 
                `<span class="text-[#00f5d4] text-xl">⛏</span>`
              }
              ${server.status === 'online' ? 
                `<span class="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#12121a]"></span>` : 
                `<span class="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 rounded-full border-2 border-[#12121a]"></span>`
              }
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-white group-hover:text-[#00f5d4] transition-colors truncate">${server.name || 'Unnamed Server'}</h3>
                ${server.verified ? `<span class="text-[#00f5d4]" title="Verified Server">✓</span>` : ''}
                ${server.claimed ? `<span class="text-[#8b5cf6]" title="Claimed by Owner">👑</span>` : ''}
              </div>
              <p class="text-[#8892b0] text-sm truncate">${server.ip}:${server.port}</p>
              
              <div class="flex items-center gap-3 mt-2 text-xs flex-wrap">
                <span class="${server.status === 'online' ? 'text-green-500' : 'text-gray-500'}">
                  ${server.status === 'online' ? '● Online' : '○ Offline'}
                </span>
                <span class="text-[#8892b0]">
                  ${server.players_online || 0}/${server.max_players || '?'} players
                </span>
                <span class="text-[#ff3864]">
                  ▲ ${server.vote_count || 0}
                </span>
                ${server.version ? `<span class="text-[#00f5d4]">${server.version}</span>` : ''}
                ${platformBadge}
              </div>
              
              ${server.tags?.length ? `
                <div class="flex flex-wrap gap-1 mt-2">
                  ${server.tags.slice(0, 3).map((tag: string) => `
                    <span class="px-2 py-0.5 bg-[#1a1a25] text-[#8892b0] rounded text-xs">${tag}</span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        </a>
      </div>
    `}).join('');
  }
  
  // Update pagination
  if (pagination) {
    pagination.classList.remove('hidden');
  }
  
  if (prevPageBtn) {
    prevPageBtn.disabled = currentPage === 1;
    prevPageBtn.classList.toggle('opacity-50', currentPage === 1);
  }
  
  if (nextPageBtn) {
    nextPageBtn.disabled = currentPage === totalPages;
    nextPageBtn.classList.toggle('opacity-50', currentPage === totalPages);
  }
  
  if (pageNumbers) {
    pageNumbers.innerHTML = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
      const pageNum = i + 1;
      const isActive = pageNum === currentPage;
      return `<button class="px-3 py-1 rounded ${isActive ? 'bg-[#00f5d4] text-[#0a0a0f]' : 'bg-[#1a1a25] text-[#8892b0]'}" data-page="${pageNum}">${pageNum}</button>`;
    }).join('');
    
    pageNumbers.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page || '1');
        updateDisplay();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }
}

// Initialize when DOM is ready
export function initMinecraftServers() {
  searchInput = document.getElementById('search-input') as HTMLInputElement;
  sortSelect = document.getElementById('sort-select') as HTMLSelectElement;
  statusSelect = document.getElementById('status-select') as HTMLSelectElement;
  versionSelect = document.getElementById('version-select') as HTMLSelectElement;
  platformSelect = document.getElementById('platform-select') as HTMLSelectElement;
  countrySelect = document.getElementById('country-select') as HTMLSelectElement;
  serversList = document.getElementById('servers-list');
  serverCount = document.getElementById('server-count');
  paginationInfo = document.getElementById('pagination-info');
  pagination = document.getElementById('pagination');
  prevPageBtn = document.getElementById('prev-page');
  nextPageBtn = document.getElementById('next-page');
  pageNumbers = document.getElementById('page-numbers');
  aiSearchToggle = document.getElementById('ai-search-toggle');
  
  // Event listeners
  searchInput?.addEventListener('input', () => {
    clearTimeout((window as any).searchTimeout);
    (window as any).searchTimeout = setTimeout(applyFilters, 300);
  });
  
  sortSelect?.addEventListener('change', applyFilters);
  statusSelect?.addEventListener('change', applyFilters);
  versionSelect?.addEventListener('change', applyFilters);
  platformSelect?.addEventListener('change', applyFilters);
  countrySelect?.addEventListener('change', applyFilters);
  
  prevPageBtn?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      updateDisplay();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  
  nextPageBtn?.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredServers.length / SERVERS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      updateDisplay();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  
  aiSearchToggle?.addEventListener('click', () => {
    aiSearchEnabled = !aiSearchEnabled;
    if (aiSearchEnabled) {
      aiSearchToggle.classList.add('bg-[#00f5d4]/20', 'border-[#00f5d4]', 'text-[#00f5d4]');
      aiSearchToggle.classList.remove('text-[#8892b0]', 'border-[#2a2a3a]');
      showToast('AI semantic search enabled', 'info');
    } else {
      aiSearchToggle.classList.remove('bg-[#00f5d4]/20', 'border-[#00f5d4]', 'text-[#00f5d4]');
      aiSearchToggle.classList.add('text-[#8892b0]', 'border-[#2a2a3a]');
    }
  });
  
  // Load servers
  loadServers();
}

// Auto-initialize if in browser
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMinecraftServers);
  } else {
    initMinecraftServers();
  }
}