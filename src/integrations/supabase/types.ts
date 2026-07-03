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
      count_items: {
        Row: {
          counted_by: string
          created_at: string
          difference: number | null
          financial_diff: number | null
          id: string
          inventory_id: string
          omie_response: Json | null
          omie_updated_at: string | null
          product_id: string
          quantity_before: number
          quantity_counted: number
          status: Database["public"]["Enums"]["count_status"]
          unit_cost: number
          updated_at: string
        }
        Insert: {
          counted_by: string
          created_at?: string
          difference?: number | null
          financial_diff?: number | null
          id?: string
          inventory_id: string
          omie_response?: Json | null
          omie_updated_at?: string | null
          product_id: string
          quantity_before?: number
          quantity_counted: number
          status?: Database["public"]["Enums"]["count_status"]
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          counted_by?: string
          created_at?: string
          difference?: number | null
          financial_diff?: number | null
          id?: string
          inventory_id?: string
          omie_response?: Json | null
          omie_updated_at?: string | null
          product_id?: string
          quantity_before?: number
          quantity_counted?: number
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
      families: {
        Row: {
          created_at: string
          id: string
          name: string
          omie_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          omie_id?: string | null
          updated_at?: string
        }
        Update: {
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
          closed_at: string | null
          created_at: string
          family_id: string | null
          id: string
          name: string
          started_at: string
          started_by: string
          status: Database["public"]["Enums"]["inventory_status"]
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          family_id?: string | null
          id?: string
          name: string
          started_at?: string
          started_by: string
          status?: Database["public"]["Enums"]["inventory_status"]
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          family_id?: string | null
          id?: string
          name?: string
          started_at?: string
          started_by?: string
          status?: Database["public"]["Enums"]["inventory_status"]
          type?: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
          full_name: string
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_color?: string
          created_at?: string
          full_name: string
          id: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_color?: string
          created_at?: string
          full_name?: string
          id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: number
          omie_update_mode: string
          updated_at: string
        }
        Insert: {
          id?: number
          omie_update_mode?: string
          updated_at?: string
        }
        Update: {
          id?: number
          omie_update_mode?: string
          updated_at?: string
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
    }
    Functions: {
      current_user_is_admin: { Args: never; Returns: boolean }
      current_user_is_supervisor_or_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "contador"
      count_status: "correto" | "divergencia" | "atualizado" | "justificado"
      inventory_status: "aberto" | "fechado"
      inventory_type: "geral" | "familia" | "produto"
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
      count_status: ["correto", "divergencia", "atualizado", "justificado"],
      inventory_status: ["aberto", "fechado"],
      inventory_type: ["geral", "familia", "produto"],
      sync_status: ["sucesso", "erro", "em_andamento"],
    },
  },
} as const
