export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auth_signup_invites: {
        Row: {
          auth_email: string
          avatar_color: string
          contact_email: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          phone: string | null
          reset_for_user_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          slug: string
          used_at: string | null
        }
        Insert: {
          auth_email: string
          avatar_color?: string
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          phone?: string | null
          reset_for_user_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          slug: string
          used_at?: string | null
        }
        Update: {
          auth_email?: string
          avatar_color?: string
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          reset_for_user_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          slug?: string
          used_at?: string | null
        }
        Relationships: []
      }
      close_requests: {
        Row: {
          approval_token: string
          approved_by: string | null
          created_at: string
          id: string
          inventory_id: string
          message: string | null
          push_to_omie: boolean
          requested_by: string
          responded_at: string | null
          status: Database["public"]["Enums"]["close_request_status"]
          updated_at: string
        }
        Insert: {
          approval_token?: string
          approved_by?: string | null
          created_at?: string
          id?: string
          inventory_id: string
          message?: string | null
          push_to_omie?: boolean
          requested_by: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["close_request_status"]
          updated_at?: string
        }
        Update: {
          approval_token?: string
          approved_by?: string | null
          created_at?: string
          id?: string
          inventory_id?: string
          message?: string | null
          push_to_omie?: boolean
          requested_by?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["close_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_requests_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      count_item_history: {
        Row: {
          action: string
          actor_id: string
          count_item_id: string | null
          created_at: string
          difference: number | null
          id: string
          inventory_id: string
          notes: string | null
          product_id: string
          quantity_before: number | null
          quantity_counted: number | null
          round: number
        }
        Insert: {
          action: string
          actor_id: string
          count_item_id?: string | null
          created_at?: string
          difference?: number | null
          id?: string
          inventory_id: string
          notes?: string | null
          product_id: string
          quantity_before?: number | null
          quantity_counted?: number | null
          round?: number
        }
        Update: {
          action?: string
          actor_id?: string
          count_item_id?: string | null
          created_at?: string
          difference?: number | null
          id?: string
          inventory_id?: string
          notes?: string | null
          product_id?: string
          quantity_before?: number | null
          quantity_counted?: number | null
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "count_item_history_count_item_id_fkey"
            columns: ["count_item_id"]
            isOneToOne: false
            referencedRelation: "count_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_item_history_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_item_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      count_item_reviews: {
        Row: {
          action: string
          count_item_id: string
          created_at: string
          deadline_at: string | null
          id: string
          inventory_id: string
          reason: string | null
          reviewer_id: string
        }
        Insert: {
          action: string
          count_item_id: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          inventory_id: string
          reason?: string | null
          reviewer_id: string
        }
        Update: {
          action?: string
          count_item_id?: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          inventory_id?: string
          reason?: string | null
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "count_item_reviews_count_item_id_fkey"
            columns: ["count_item_id"]
            isOneToOne: false
            referencedRelation: "count_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_item_reviews_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      count_items: {
        Row: {
          client_mutation_id: string | null
          counted_by: string
          created_at: string
          difference: number | null
          financial_diff: number | null
          id: string
          inventory_id: string
          needs_adjust: boolean
          needs_recount: boolean
          omie_response: Json | null
          omie_updated_at: string | null
          product_id: string
          quantity_before: number
          quantity_counted: number
          reviewer_note: string | null
          round: number
          status: Database["public"]["Enums"]["count_status"]
          unit_cost: number
          updated_at: string
        }
        Insert: {
          client_mutation_id?: string | null
          counted_by: string
          created_at?: string
          difference?: number | null
          financial_diff?: number | null
          id?: string
          inventory_id: string
          needs_adjust?: boolean
          needs_recount?: boolean
          omie_response?: Json | null
          omie_updated_at?: string | null
          product_id: string
          quantity_before?: number
          quantity_counted: number
          reviewer_note?: string | null
          round?: number
          status?: Database["public"]["Enums"]["count_status"]
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          client_mutation_id?: string | null
          counted_by?: string
          created_at?: string
          difference?: number | null
          financial_diff?: number | null
          id?: string
          inventory_id?: string
          needs_adjust?: boolean
          needs_recount?: boolean
          omie_response?: Json | null
          omie_updated_at?: string | null
          product_id?: string
          quantity_before?: number
          quantity_counted?: number
          reviewer_note?: string | null
          round?: number
          status?: Database["public"]["Enums"]["count_status"]
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "count_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      families: {
        Row: {
          countable: boolean
          created_at: string
          id: string
          name: string
          omie_id: string | null
          updated_at: string
        }
        Insert: {
          countable?: boolean
          created_at?: string
          id?: string
          name: string
          omie_id?: string | null
          updated_at?: string
        }
        Update: {
          countable?: boolean
          created_at?: string
          id?: string
          name?: string
          omie_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventories: {
        Row: {
          assigned_admin_id: string | null
          assigned_counter_id: string | null
          assigned_supervisor_id: string | null
          closed_at: string | null
          created_at: string
          deadline_at: string | null
          due_at: string | null
          family_id: string | null
          id: string
          name: string
          notes: string | null
          started_at: string
          started_by: string
          status: Database["public"]["Enums"]["inventory_status"]
          tolerance_pct: number
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          assigned_counter_id?: string | null
          assigned_supervisor_id?: string | null
          closed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          due_at?: string | null
          family_id?: string | null
          id?: string
          name: string
          notes?: string | null
          started_at?: string
          started_by: string
          status?: Database["public"]["Enums"]["inventory_status"]
          tolerance_pct?: number
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          assigned_counter_id?: string | null
          assigned_supervisor_id?: string | null
          closed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          due_at?: string | null
          family_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_at?: string
          started_by?: string
          status?: Database["public"]["Enums"]["inventory_status"]
          tolerance_pct?: number
          type?: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventories_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventories_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "ranking_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "scoring_monthly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "scoring_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_counter_id_fkey"
            columns: ["assigned_counter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventories_assigned_counter_id_fkey"
            columns: ["assigned_counter_id"]
            isOneToOne: false
            referencedRelation: "ranking_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_counter_id_fkey"
            columns: ["assigned_counter_id"]
            isOneToOne: false
            referencedRelation: "scoring_monthly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_counter_id_fkey"
            columns: ["assigned_counter_id"]
            isOneToOne: false
            referencedRelation: "scoring_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_supervisor_id_fkey"
            columns: ["assigned_supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventories_assigned_supervisor_id_fkey"
            columns: ["assigned_supervisor_id"]
            isOneToOne: false
            referencedRelation: "ranking_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_supervisor_id_fkey"
            columns: ["assigned_supervisor_id"]
            isOneToOne: false
            referencedRelation: "scoring_monthly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_assigned_supervisor_id_fkey"
            columns: ["assigned_supervisor_id"]
            isOneToOne: false
            referencedRelation: "scoring_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_families: {
        Row: {
          created_at: string
          family_id: string
          inventory_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          inventory_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          inventory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_families_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_families_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          created_at: string
          inventory_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          inventory_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          inventory_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_rejections: {
        Row: {
          created_at: string
          id: string
          inventory_id: string
          notes: string | null
          product_ids: string[]
          reason: string
          recount_deadline: string | null
          rejected_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_id: string
          notes?: string | null
          product_ids?: string[]
          reason: string
          recount_deadline?: string | null
          rejected_by: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_id?: string
          notes?: string | null
          product_ids?: string[]
          reason?: string
          recount_deadline?: string | null
          rejected_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_rejections_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      loss_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      losses: {
        Row: {
          count_item_id: string | null
          created_at: string
          created_by: string
          id: string
          observation: string | null
          omie_response: Json | null
          omie_updated_at: string | null
          product_id: string
          quantity: number
          reason_id: string
        }
        Insert: {
          count_item_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          observation?: string | null
          omie_response?: Json | null
          omie_updated_at?: string | null
          product_id: string
          quantity: number
          reason_id: string
        }
        Update: {
          count_item_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          observation?: string | null
          omie_response?: Json | null
          omie_updated_at?: string | null
          product_id?: string
          quantity?: number
          reason_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "losses_count_item_id_fkey"
            columns: ["count_item_id"]
            isOneToOne: false
            referencedRelation: "count_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "losses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "losses_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "loss_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          inventory_id: string | null
          kind: string
          payload: Json
          scheduled_for: string
          sent_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          inventory_id?: string | null
          kind: string
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          inventory_id?: string | null
          kind?: string
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          code: string
          cost: number
          created_at: string
          family_id: string | null
          family_name: string | null
          id: string
          last_synced_at: string | null
          location: string | null
          name: string
          omie_id: string
          price: number | null
          stock_omie: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          code: string
          cost?: number
          created_at?: string
          family_id?: string | null
          family_name?: string | null
          id?: string
          last_synced_at?: string | null
          location?: string | null
          name: string
          omie_id: string
          price?: number | null
          stock_omie?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          code?: string
          cost?: number
          created_at?: string
          family_id?: string | null
          family_name?: string | null
          id?: string
          last_synced_at?: string | null
          location?: string | null
          name?: string
          omie_id?: string
          price?: number | null
          stock_omie?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_color: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_color?: string
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_color?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          auto_sync_interval_seconds: number
          id: number
          n8n_webhook_secret: string | null
          n8n_webhook_url: string | null
          notif_enabled: boolean
          notif_from_email: string | null
          notif_from_name: string | null
          notif_reply_to: string | null
          omie_update_mode: string
          tolerance_pct_default: number
          updated_at: string
        }
        Insert: {
          auto_sync_interval_seconds?: number
          id?: number
          n8n_webhook_secret?: string | null
          n8n_webhook_url?: string | null
          notif_enabled?: boolean
          notif_from_email?: string | null
          notif_from_name?: string | null
          notif_reply_to?: string | null
          omie_update_mode?: string
          tolerance_pct_default?: number
          updated_at?: string
        }
        Update: {
          auto_sync_interval_seconds?: number
          id?: number
          n8n_webhook_secret?: string | null
          n8n_webhook_url?: string | null
          notif_enabled?: boolean
          notif_from_email?: string | null
          notif_from_name?: string | null
          notif_reply_to?: string | null
          omie_update_mode?: string
          tolerance_pct_default?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          finished_at: string | null
          id: string
          items_count: number | null
          message: string | null
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          type: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          items_count?: number | null
          message?: string | null
          started_at?: string
          status: Database["public"]["Enums"]["sync_status"]
          type: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          items_count?: number | null
          message?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          type?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ranking_view: {
        Row: {
          acertos: number | null
          conferidos: number | null
          divergencias: number | null
          full_name: string | null
          month: string | null
          percentual: number | null
          user_id: string | null
        }
        Relationships: []
      }
      scoring_monthly: {
        Row: {
          accuracy_pct: number | null
          full_name: string | null
          individual_score: number | null
          month: string | null
          ontime_pct: number | null
          team_id: string | null
          team_name: string | null
          total_conferidos: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_weekly: {
        Row: {
          accuracy_pct: number | null
          full_name: string | null
          individual_score: number | null
          ontime_pct: number | null
          team_id: string | null
          team_name: string | null
          total_conferidos: number | null
          user_id: string | null
          week: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_scoring_monthly: {
        Row: {
          members_count: number | null
          month: string | null
          team_id: string | null
          team_name: string | null
          team_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_user_is_admin: { Args: never; Returns: boolean }
      current_user_is_supervisor_or_admin: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_loss_notification_context: {
        Args: { _loss_id: string }
        Returns: Json
      }
      get_public_settings: {
        Args: never
        Returns: {
          auto_sync_interval_seconds: number
          notif_enabled: boolean
          omie_update_mode: string
          tolerance_pct_default: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_assignable_profiles: {
        Args: never
        Returns: {
          full_name: string
          id: string
          roles: string[]
        }[]
      }
      list_login_profiles: {
        Args: never
        Returns: {
          active: boolean
          avatar_color: string
          full_name: string
          id: string
          slug: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      queue_transactional_email: { Args: { _payload: Json }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "contador"
      close_request_status: "pendente" | "aprovado" | "recusado" | "cancelado"
      count_status: "correto" | "divergencia" | "atualizado" | "justificado"
      inventory_status:
        | "aberto"
        | "fechado"
        | "pendente"
        | "em_andamento"
        | "concluida"
        | "pendente_validacao"
        | "divergencia"
        | "recontagem_solicitada"
        | "ajuste_solicitado"
        | "recontagem_enviada"
        | "aguardando_validacao"
        | "aprovada"
        | "reprovada"
      inventory_type: "geral" | "familia" | "produto" | "personalizado"
      sync_status: "sucesso" | "erro" | "em_andamento"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "contador"],
      close_request_status: ["pendente", "aprovado", "recusado", "cancelado"],
      count_status: ["correto", "divergencia", "atualizado", "justificado"],
      inventory_status: [
        "aberto",
        "fechado",
        "pendente",
        "em_andamento",
        "concluida",
        "pendente_validacao",
        "divergencia",
        "recontagem_solicitada",
        "ajuste_solicitado",
        "recontagem_enviada",
        "aguardando_validacao",
        "aprovada",
        "reprovada",
      ],
      inventory_type: ["geral", "familia", "produto", "personalizado"],
      sync_status: ["sucesso", "erro", "em_andamento"],
    },
  },
} as const
