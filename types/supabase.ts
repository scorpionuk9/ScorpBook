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
      accounting_bank_reconciliation_events: {
        Row: {
          actor_id: string | null
          details: Json
          event_type: string
          id: string
          occurred_at: string
          reconciliation_id: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          details?: Json
          event_type: string
          id?: string
          occurred_at?: string
          reconciliation_id: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          reconciliation_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_bank_reconciliation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_bank_reconciliations: {
        Row: {
          bank_account_id: string
          closing_balance: number
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          id: string
          opening_balance: number
          period_end: string
          period_start: string
          status: string
          tenant_id: string
        }
        Insert: {
          bank_account_id: string
          closing_balance: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          opening_balance: number
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          opening_balance?: number
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_bank_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_reconciliation_account"
            columns: ["tenant_id", "bank_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      accounting_bank_statement_lines: {
        Row: {
          amount: number
          bank_reference: string | null
          created_at: string
          description: string
          id: string
          line_number: number
          matched_at: string | null
          matched_by: string | null
          matched_journal_line_id: string | null
          reconciliation_id: string
          tenant_id: string
          transaction_date: string
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          created_at?: string
          description: string
          id?: string
          line_number: number
          matched_at?: string | null
          matched_by?: string | null
          matched_journal_line_id?: string | null
          reconciliation_id: string
          tenant_id: string
          transaction_date: string
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          created_at?: string
          description?: string
          id?: string
          line_number?: number
          matched_at?: string | null
          matched_by?: string | null
          matched_journal_line_id?: string | null
          reconciliation_id?: string
          tenant_id?: string
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_bank_statement_lines_matched_journal_line_id_fkey"
            columns: ["matched_journal_line_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_statement_line_reconciliation"
            columns: ["tenant_id", "reconciliation_id"]
            isOneToOne: false
            referencedRelation: "accounting_bank_reconciliations"
            referencedColumns: ["tenant_id", "id"]
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
      accounting_supplier_bill_events: {
        Row: {
          actor_id: string | null
          bill_id: string
          details: Json
          event_type: string
          id: string
          occurred_at: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          bill_id: string
          details?: Json
          event_type: string
          id?: string
          occurred_at?: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          bill_id?: string
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_supplier_bill_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_supplier_bill_lines: {
        Row: {
          bill_id: string
          created_at: string
          description: string
          expense_account_id: string
          id: string
          net_amount: number
          tenant_id: string
          vat_amount: number
        }
        Insert: {
          bill_id: string
          created_at?: string
          description: string
          expense_account_id: string
          id?: string
          net_amount: number
          tenant_id: string
          vat_amount?: number
        }
        Update: {
          bill_id?: string
          created_at?: string
          description?: string
          expense_account_id?: string
          id?: string
          net_amount?: number
          tenant_id?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_supplier_bill_line_account"
            columns: ["tenant_id", "expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "fk_supplier_bill_line_bill"
            columns: ["tenant_id", "bill_id"]
            isOneToOne: false
            referencedRelation: "accounting_supplier_bills"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      accounting_supplier_bill_payments: {
        Row: {
          amount: number
          bank_account_id: string
          bill_id: string
          created_at: string
          created_by: string
          id: string
          journal_entry_id: string
          payment_date: string
          tenant_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          bill_id: string
          created_at?: string
          created_by: string
          id?: string
          journal_entry_id: string
          payment_date: string
          tenant_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          bill_id?: string
          created_at?: string
          created_by?: string
          id?: string
          journal_entry_id?: string
          payment_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_supplier_bill_payment_bank"
            columns: ["tenant_id", "bank_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "fk_supplier_bill_payment_bill"
            columns: ["tenant_id", "bill_id"]
            isOneToOne: false
            referencedRelation: "accounting_supplier_bills"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "fk_supplier_bill_payment_journal"
            columns: ["tenant_id", "journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      accounting_supplier_bills: {
        Row: {
          bill_date: string
          bill_number: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string
          id: string
          journal_entry_id: string | null
          status: string
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bill_date: string
          bill_number: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date: string
          id?: string
          journal_entry_id?: string | null
          status?: string
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string
          id?: string
          journal_entry_id?: string | null
          status?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_supplier_bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_supplier_bill_journal"
            columns: ["tenant_id", "journal_entry_id"]
            isOneToOne: false
            referencedRelation: "accounting_journal_entries"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "fk_supplier_bill_supplier"
            columns: ["tenant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "accounting_suppliers"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      accounting_supplier_code_counters: {
        Row: {
          last_number: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_supplier_code_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_supplier_events: {
        Row: {
          actor_id: string | null
          details: Json
          event_type: string
          id: string
          occurred_at: string
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          details?: Json
          event_type: string
          id?: string
          occurred_at?: string
          supplier_id: string
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_supplier_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_suppliers: {
        Row: {
          address: string | null
          created_at: string
          default_expense_account_id: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          supplier_code: string
          tax_number: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          default_expense_account_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          supplier_code: string
          tax_number?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          default_expense_account_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          supplier_code?: string
          tax_number?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "accounting_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_accounting_suppliers_default_expense"
            columns: ["tenant_id", "default_expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounting_accounts"
            referencedColumns: ["tenant_id", "id"]
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
      allocate_supplier_code: { Args: { p_tenant_id: string }; Returns: string }
      complete_bank_reconciliation: {
        Args: {
          p_actor_id: string
          p_reconciliation_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_bank_reconciliation: {
        Args: {
          p_actor_id: string
          p_bank_account_id: string
          p_closing_balance: number
          p_opening_balance: number
          p_period_end: string
          p_period_start: string
          p_tenant_id: string
        }
        Returns: string
      }
      get_balance_sheet: {
        Args: { p_as_of_date: string; p_tenant_id: string }
        Returns: Json
      }
      get_income_statement: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          amount: string
        }[]
      }
      get_trial_balance: {
        Args: { p_as_of_date: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          credit_activity: string
          credit_balance: string
          debit_activity: string
          debit_balance: string
          is_active: boolean
        }[]
      }
      import_bank_statement_lines: {
        Args: {
          p_actor_id: string
          p_reconciliation_id: string
          p_rows: Json
          p_tenant_id: string
        }
        Returns: number
      }
      match_bank_statement_line: {
        Args: {
          p_actor_id: string
          p_journal_line_id: string
          p_statement_line_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      post_journal_entry: {
        Args: { p_actor_id?: string; p_entry_id: string; p_tenant_id: string }
        Returns: string
      }
      post_supplier_bill: {
        Args: { p_actor_id: string; p_bill_id: string; p_tenant_id: string }
        Returns: Json
      }
      record_supplier_bill_payment: {
        Args: {
          p_actor_id: string
          p_amount: number
          p_bank_account_id: string
          p_bill_id: string
          p_payment_date: string
          p_tenant_id: string
        }
        Returns: Json
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
      save_accounting_supplier: {
        Args: {
          p_actor_id: string
          p_address?: string
          p_default_expense_account_id?: string
          p_email?: string
          p_is_active?: boolean
          p_name: string
          p_phone?: string
          p_supplier_code: string
          p_supplier_id?: string
          p_tax_number?: string
          p_tenant_id: string
        }
        Returns: string
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
      save_supplier_bill: {
        Args: {
          p_actor_id: string
          p_bill_date: string
          p_bill_id?: string
          p_bill_number: string
          p_description: string
          p_due_date: string
          p_lines: Json
          p_supplier_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      suggest_journal_entry_number: {
        Args: { p_entry_date: string; p_tenant_id: string }
        Returns: string
      }
      suggest_supplier_code: { Args: { p_tenant_id: string }; Returns: string }
      unmatch_bank_statement_line: {
        Args: {
          p_actor_id: string
          p_statement_line_id: string
          p_tenant_id: string
        }
        Returns: undefined
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
