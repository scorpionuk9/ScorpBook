import "server-only";

import type { Tables } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";
import { SCORPBOOK_TENANT_ID } from "@/lib/accounting/constants";
import type { z } from "zod";
import { accountSchema, journalSchema, postSchema, reverseSchema } from "@/lib/accounting/schemas";

export type Account = Tables<"accounting_accounts">;
export type JournalEntry = Tables<"accounting_journal_entries">;
export type JournalLine = Tables<"accounting_journal_lines">;
export type ExactJournalLine = Omit<JournalLine, "debit" | "credit"> & { debit: string; credit: string };
export type JournalDraftInput = z.infer<typeof journalSchema>;

function throwOnError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(`${fallback}：${error.message}`);
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await createAdminClient().from("accounting_accounts")
    .select("*").eq("tenant_id", SCORPBOOK_TENANT_ID).order("code");
  throwOnError(error, "載入科目失敗");
  return data ?? [];
}

export async function saveAccount(input: unknown): Promise<void> {
  const account = accountSchema.parse(input);
  const client = createAdminClient();
  if (account.id) {
    const { data: existing, error: readError } = await client.from("accounting_accounts")
      .select("id, code, type").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", account.id).single();
    throwOnError(readError, "讀取科目失敗");
    if (!existing) throw new Error("找不到要更新的科目。");
    if (existing.code !== account.code || existing.type !== account.type) {
      throw new Error("科目代碼與類型建立後不可修改，以保持歷史報表一致。");
    }
    const { error } = await client.from("accounting_accounts")
      .update({ name: account.name, is_active: account.is_active })
      .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", account.id);
    throwOnError(error, "更新科目失敗");
    return;
  }
  const { error } = await client.from("accounting_accounts").insert({
    tenant_id: SCORPBOOK_TENANT_ID,
    code: account.code,
    name: account.name,
    type: account.type,
    is_active: account.is_active,
  });
  throwOnError(error, "新增科目失敗");
}

export async function listJournalEntries(): Promise<Array<JournalEntry & { lines: ExactJournalLine[] }>> {
  const client = createAdminClient();
  const { data: entries, error } = await client.from("accounting_journal_entries")
    .select("*").eq("tenant_id", SCORPBOOK_TENANT_ID).order("entry_date", { ascending: false })
    .order("created_at", { ascending: false }).limit(100);
  throwOnError(error, "載入日記帳失敗");
  if (!entries?.length) return [];
  const { data: lines, error: lineError } = await client.from("accounting_journal_lines")
    .select("id, tenant_id, entry_id, account_id, description, created_at, debit::text, credit::text")
    .eq("tenant_id", SCORPBOOK_TENANT_ID).in("entry_id", entries.map((entry) => entry.id));
  throwOnError(lineError, "載入分錄明細失敗");
  const byEntry = new Map<string, ExactJournalLine[]>();
  for (const line of lines ?? []) byEntry.set(line.entry_id, [...(byEntry.get(line.entry_id) ?? []), line]);
  return entries.map((entry) => ({ ...entry, lines: byEntry.get(entry.id) ?? [] }));
}

export async function saveDraftJournal(input: unknown, actorId: string): Promise<string> {
  const entry = journalSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("save_draft_journal_entry", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_entry_number: entry.entry_number,
    p_entry_date: entry.entry_date,
    p_source_type: entry.source_type,
    p_lines: entry.lines.map((line) => ({
      account_id: line.account_id,
      description: line.description || null,
      debit: line.debit,
      credit: line.credit,
    })),
    p_description: entry.description || undefined,
    p_entry_id: entry.entry_id,
    p_actor_id: actorId,
  });
  throwOnError(error, "儲存草稿失敗");
  if (!data) throw new Error("儲存草稿失敗：資料庫未回傳憑證 ID");
  return data;
}

export async function postJournal(input: unknown, actorId: string): Promise<void> {
  const { entry_id } = postSchema.parse(input);
  const { error } = await createAdminClient().rpc("post_journal_entry", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_entry_id: entry_id,
    p_actor_id: actorId,
  });
  throwOnError(error, "過帳失敗");
}

export async function reverseJournal(input: unknown, actorId: string): Promise<string> {
  const reversal = reverseSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("reverse_journal_entry", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_entry_id: reversal.entry_id,
    p_reversal_entry_number: reversal.reversal_entry_number,
    p_reversal_date: reversal.reversal_date,
    p_description: reversal.description || undefined,
    p_actor_id: actorId,
  });
  throwOnError(error, "沖銷失敗");
  if (!data) throw new Error("沖銷失敗：資料庫未回傳憑證 ID");
  return data;
}
