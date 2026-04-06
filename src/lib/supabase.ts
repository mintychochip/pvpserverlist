import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

export type Server = {
  id: string;
  name: string;
  game: string;
  mode?: string;
  map?: string;
  players: number;
  max_players: number;
  ip: string;
  port: number;
  status: 'online' | 'offline';
  country?: string;
  description?: string;
  banner_url?: string;
  created_at?: string;
};

export type GameCategory = {
  id: string;
  name: string;
  slug: string;
  server_count: number;
  icon?: string;
  featured?: boolean;
};

export async function getServers(game?: string, limit = 20): Promise<Server[]> {
  let query = supabase
    .from('servers')
    .select('*')
    .eq('status', 'online')
    .order('players', { ascending: false })
    .limit(limit);

  if (game) {
    query = query.eq('game', game);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching servers:', error);
    return [];
  }
  
  return data || [];
}

export async function getGameCategories(): Promise<GameCategory[]> {
  const { data, error } = await supabase
    .from('game_categories')
    .select('*')
    .order('server_count', { ascending: false });

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return data || [];
}

export async function getStats() {
  const { data, error } = await supabase
    .from('stats')
    .select('*')
    .single();

  if (error) {
    console.error('Error fetching stats:', error);
    return {
      total_servers: 2189,
      game_modes: 50,
      online_players: 0,
    };
  }

  return data || {
    total_servers: 2189,
    game_modes: 50,
    online_players: 0,
  };
}