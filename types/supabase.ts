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
      accounting_accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounting_accounts_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          entry_number: string
          id: string
          reverses_entry_id: string | null
          source_event: string | null
          source_id: string | null
          source_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_number: string
          id?: string
          reverses_entry_id?: string | null
          source_event?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_number?: string
          id?: string
          reverses_entry_id?: string | null
          source_event?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounting_entries_reversed_entry"
            columns: ["tenant_id", "reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "fk_accounting_entries_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_entry_events: {
        Row: {
          actor_id: string | null
          details: Json
          entry_id: string
          event_type: string
          id: string
          occurred_at: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          details?: Json
          entry_id: string
          event_type: string
          id?: string
          occurred_at?: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          details?: Json
          entry_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_entry_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_accounting_lines_account"
            columns: ["tenant_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "fk_accounting_lines_entry"
            columns: ["tenant_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      accounting_journal_number_counters: {
        Row: {
          entry_year: number
          last_number: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          entry_year: number
          last_number?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          entry_year?: number
          last_number?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_journal_number_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_tenants: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_id: string
          id: string
          payload: Json
          processed_at: string
          source_system: string
          tenant_id: string
        }
        Insert: {
          event_id: string
          id?: string
          payload: Json
          processed_at?: string
          source_system: string
          tenant_id: string
        }
        Update: {
          event_id?: string
          id?: string
          payload?: Json
          processed_at?: string
          source_system?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_webhook_events_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_journal_entry_number: {
        Args: {
          p_entry_date: string
          p_requested_number?: string
          p_tenant_id: string
        }
        Returns: string
      }
      post_journal_entry: {
        Args: { p_actor_id?: string; p_entry_id: string; p_tenant_id: string }
        Returns: string
      }
      reverse_journal_entry: {
        Args: {
          p_actor_id?: string
          p_description?: string
          p_entry_id: string
          p_reversal_date?: string
          p_reversal_entry_number: string
          p_tenant_id: string
        }
        Returns: string
      }
      reverse_journal_entry_numbered: {
        Args: {
          p_actor_id?: string
          p_description?: string
          p_entry_id: string
          p_requested_entry_number?: string
          p_reversal_date?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      save_draft_journal_entry: {
        Args: {
          p_actor_id?: string
          p_description?: string
          p_entry_date: string
          p_entry_id?: string
          p_entry_number: string
          p_lines: Json
          p_source_event?: string
          p_source_id?: string
          p_source_type: string
          p_tenant_id: string
        }
        Returns: string
      }
      save_draft_journal_entry_numbered: {
        Args: {
          p_actor_id?: string
          p_description?: string
          p_entry_date: string
          p_entry_id?: string
          p_lines: Json
          p_requested_entry_number?: string
          p_source_event?: string
          p_source_id?: string
          p_source_type: string
          p_tenant_id: string
        }
        Returns: Json
      }
      suggest_journal_entry_number: {
        Args: { p_entry_date: string; p_tenant_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
