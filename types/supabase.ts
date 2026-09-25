// Type definitions for the ScorpBook public schema.
// These reflect supabase/migrations/20260925143000_create_accounting_ledger.sql.
// Regenerate from the linked Supabase project with:
//   supabase gen types typescript --project-id qwxjywzowieigkodzwee --schema public

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

export type EntryStatus = "DRAFT" | "POSTED" | "VOIDED";

export type Database = {
  public: {
    Tables: {
      accounting_accounts: {
        Row: {
          id: string;
          tenant_id: string;
          code: string;
          name: string;
          type: AccountType;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          code: string;
          name: string;
          type: AccountType;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          code?: string;
          name?: string;
          type?: AccountType;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounting_journal_entries: {
        Row: {
          id: string;
          tenant_id: string;
          entry_number: string;
          entry_date: string;
          description: string | null;
          source_type: string;
          source_id: string | null;
          source_event: string | null;
          status: EntryStatus;
          reverses_entry_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entry_number: string;
          entry_date?: string;
          description?: string | null;
          source_type: string;
          source_id?: string | null;
          source_event?: string | null;
          status?: EntryStatus;
          reverses_entry_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          entry_number?: string;
          entry_date?: string;
          description?: string | null;
          source_type?: string;
          source_id?: string | null;
          source_event?: string | null;
          status?: EntryStatus;
          reverses_entry_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_accounting_entries_reversed_entry";
            columns: ["tenant_id", "reverses_entry_id"];
            isOneToOne: false;
            referencedRelation: "accounting_journal_entries";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      accounting_journal_lines: {
        Row: {
          id: string;
          tenant_id: string;
          entry_id: string;
          account_id: string;
          description: string | null;
          debit: number;
          credit: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          entry_id: string;
          account_id: string;
          description?: string | null;
          debit?: number;
          credit?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          entry_id?: string;
          account_id?: string;
          description?: string | null;
          debit?: number;
          credit?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_accounting_lines_entry";
            columns: ["tenant_id", "entry_id"];
            isOneToOne: false;
            referencedRelation: "accounting_journal_entries";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "fk_accounting_lines_account";
            columns: ["tenant_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "accounting_accounts";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          id: string;
          tenant_id: string;
          event_id: string;
          source_system: string;
          payload: Json;
          processed_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          event_id: string;
          source_system: string;
          payload: Json;
          processed_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          event_id?: string;
          source_system?: string;
          payload?: Json;
          processed_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      assert_posted_entry_balanced: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      guard_accounting_entry_mutation: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      guard_accounting_line_mutation: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      set_accounting_updated_at: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  TableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends TableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[TableNameOrOptions["schema"]]["Tables"] &
        Database[TableNameOrOptions["schema"]]["Views"])
    : never = never,
> = TableNameOrOptions extends { schema: keyof Database }
  ? (Database[TableNameOrOptions["schema"]]["Tables"] &
      Database[TableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer Row;
    }
    ? Row
    : never
  : TableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableNameOrOptions] extends {
        Row: infer Row;
      }
      ? Row
      : never
    : never;

export type TablesInsert<
  TableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends TableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[TableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = TableNameOrOptions extends { schema: keyof Database }
  ? Database[TableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer Insert;
    }
    ? Insert
    : never
  : TableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][TableNameOrOptions] extends {
        Insert: infer Insert;
      }
      ? Insert
      : never
    : never;

export type TablesUpdate<
  TableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends TableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[TableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = TableNameOrOptions extends { schema: keyof Database }
  ? Database[TableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer Update;
    }
    ? Update
    : never
  : TableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][TableNameOrOptions] extends {
        Update: infer Update;
      }
      ? Update
      : never
    : never;
