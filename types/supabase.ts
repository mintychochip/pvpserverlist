export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      servers: {
        Row: {
          id: string
          ip: string
          port: number
          name: string
          description: string | null
          version: string | null
          tags: string[]
          verified: boolean
          votifier_key: string | null
          vote_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ip: string
          port?: number
          name: string
          description?: string | null
          version?: string | null
          tags?: string[]
          verified?: boolean
          votifier_key?: string | null
          vote_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ip?: string
          port?: number
          name?: string
          description?: string | null
          version?: string | null
          tags?: string[]
          verified?: boolean
          votifier_key?: string | null
          vote_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      server_status: {
        Row: {
          id: string
          server_id: string
          status: boolean
          latency_ms: number | null
          player_count: number
          max_players: number
          motd: string | null
          last_checked: string
        }
        Insert: {
          id?: string
          server_id: string
          status?: boolean
          latency_ms?: number | null
          player_count?: number
          max_players?: number
          motd?: string | null
          last_checked?: string
        }
        Update: {
          id?: string
          server_id?: string
          status?: boolean
          latency_ms?: number | null
          player_count?: number
          max_players?: number
          motd?: string | null
          last_checked?: string
        }
      }
      votes: {
        Row: {
          id: string
          server_id: string
          visitor_ip: string
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          visitor_ip: string
          created_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          visitor_ip?: string
          created_at?: string
        }
      }
      verification_tokens: {
        Row: {
          id: string
          server_id: string
          token: string
          motd_pattern: string
          expires_at: string
          verified_at: string | null
        }
        Insert: {
          id?: string
          server_id: string
          token: string
          motd_pattern: string
          expires_at?: string
          verified_at?: string | null
        }
        Update: {
          id?: string
          server_id?: string
          token?: string
          motd_pattern?: string
          expires_at?: string
          verified_at?: string | null
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
