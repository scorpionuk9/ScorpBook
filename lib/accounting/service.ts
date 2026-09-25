import "server-only";

import type { Json, Tables } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";
import { SCORPBOOK_TENANT_ID } from "@/lib/accounting/constants";
import { z } from "zod";
import { accountSchema, bankMatchSchema, bankReconciliationSchema, bankStatementLineIdSchema, bankStatementRowsSchema, completeBankReconciliationSchema, journalSchema, postSchema, reverseSchema, supplierBillPaymentSchema, supplierBillSchema, supplierSchema } from "@/lib/accounting/schemas";
import Decimal from "decimal.js";

export type Account = Tables<"accounting_accounts">;
export type Supplier = Tables<"accounting_suppliers">;
export type JournalEntry = Tables<"accounting_journal_entries">;
export type JournalLine = Tables<"accounting_journal_lines">;
export type ExactJournalLine = Omit<JournalLine, "debit" | "credit"> & { debit: string; credit: string };
export type JournalDraftInput = z.infer<typeof journalSchema>;
export type NumberedJournalEntry = { id: string; entry_number: string };
export type TrialBalanceRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_active: boolean;
  debit_activity: string;
  credit_activity: string;
  debit_balance: string;
  credit_balance: string;
};
export type IncomeStatementRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: "REVENUE" | "EXPENSE";
  amount: string;
};
export type BalanceSheetAccountRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY";
  is_active: boolean;
  amount: string;
};
export type BalanceSheetData = { accounts: BalanceSheetAccountRow[]; current_earnings: string };
export type SupplierBillLine = Omit<Tables<"accounting_supplier_bill_lines">, "net_amount" | "vat_amount"> & { net_amount: string; vat_amount: string };
export type SupplierBillPayment = Omit<Tables<"accounting_supplier_bill_payments">, "amount"> & { amount: string };
export type SupplierBill = Tables<"accounting_supplier_bills"> & {
  lines: SupplierBillLine[];
  payments: SupplierBillPayment[];
  supplier_name: string;
  total: string;
  paid_total: string;
  outstanding: string;
};
export type BankReconciliation = Omit<Tables<"accounting_bank_reconciliations">, "opening_balance" | "closing_balance"> & {
  opening_balance: string; closing_balance: string; bank_account_name: string;
};
export type BankStatementLine = Omit<Tables<"accounting_bank_statement_lines">, "amount"> & {
  amount: string; matched_entry_number: string | null;
};
export type BankJournalCandidate = {
  id: string; entry_id: string; entry_number: string; entry_date: string; entry_description: string | null;
  description: string | null; debit: string; credit: string; matched_statement_line_id: string | null;
};
export type BankReconciliationDetail = {
  reconciliation: BankReconciliation; lines: BankStatementLine[]; candidates: BankJournalCandidate[];
};

const numberedJournalEntrySchema = z.object({ id: z.string().uuid(), entry_number: z.string().min(1) });

function throwOnError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(`${fallback}：${error.message}`);
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await createAdminClient().from("accounting_accounts")
    .select("*").eq("tenant_id", SCORPBOOK_TENANT_ID).order("code");
  throwOnError(error, "Failed to load accounts");
  return data ?? [];
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await createAdminClient().from("accounting_suppliers")
    .select("*").eq("tenant_id", SCORPBOOK_TENANT_ID).order("name").order("supplier_code");
  throwOnError(error, "Failed to load suppliers");
  return data ?? [];
}

export async function suggestSupplierCode(): Promise<string> {
  const { data, error } = await createAdminClient().rpc("suggest_supplier_code", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
  });
  throwOnError(error, "Failed to suggest supplier code");
  if (!data) throw new Error("The database did not return a supplier code suggestion.");
  return data;
}

export async function saveSupplier(input: unknown, actorId: string): Promise<string> {
  const supplier = supplierSchema.parse(input);
  const client = createAdminClient();
  if (supplier.default_expense_account_id) {
    const { data: expenseAccount, error } = await client.from("accounting_accounts")
      .select("id").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", supplier.default_expense_account_id)
      .eq("type", "EXPENSE").eq("is_active", true).maybeSingle();
    throwOnError(error, "Failed to validate default expense account");
    if (!expenseAccount) throw new Error("Choose an active expense account for this supplier.");
  }

  const { data, error } = await client.rpc("save_accounting_supplier", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_actor_id: actorId,
    p_supplier_code: supplier.supplier_code,
    p_name: supplier.name,
    p_email: supplier.email,
    p_phone: supplier.phone,
    p_tax_number: supplier.tax_number,
    p_address: supplier.address,
    p_default_expense_account_id: supplier.default_expense_account_id,
    p_is_active: supplier.is_active,
    p_supplier_id: supplier.id,
  });
  throwOnError(error, "Failed to save supplier");
  if (!data) throw new Error("The database did not return the saved supplier ID.");
  const { data: savedSupplier, error: readError } = await client.from("accounting_suppliers")
    .select("supplier_code").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", data).single();
  throwOnError(readError, "Failed to read the saved supplier code");
  if (!savedSupplier) throw new Error("The saved supplier could not be found.");
  return savedSupplier.supplier_code;
}

export async function listSupplierBills(): Promise<SupplierBill[]> {
  const client = createAdminClient();
  const billResult = await client.from("accounting_supplier_bills").select("*").eq("tenant_id", SCORPBOOK_TENANT_ID)
    .order("bill_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  throwOnError(billResult.error, "Failed to load supplier bills");
  if (!billResult.data?.length) return [];
  const billIds = billResult.data.map((bill) => bill.id);
  const [supplierResult, lineResult, paymentResult] = await Promise.all([
    client.from("accounting_suppliers").select("id, name").eq("tenant_id", SCORPBOOK_TENANT_ID),
    client.from("accounting_supplier_bill_lines").select("id, tenant_id, bill_id, expense_account_id, description, created_at, net_amount::text, vat_amount::text")
      .eq("tenant_id", SCORPBOOK_TENANT_ID).in("bill_id", billIds),
    client.from("accounting_supplier_bill_payments").select("id, tenant_id, bill_id, payment_date, bank_account_id, journal_entry_id, created_by, created_at, amount::text")
      .eq("tenant_id", SCORPBOOK_TENANT_ID).in("bill_id", billIds),
  ]);
  throwOnError(supplierResult.error, "Failed to load suppliers");
  throwOnError(lineResult.error, "Failed to load supplier bill lines");
  throwOnError(paymentResult.error, "Failed to load supplier bill payments");
  const suppliers = new Map((supplierResult.data ?? []).map((item) => [item.id, item.name]));
  const lines = new Map<string, SupplierBillLine[]>();
  const payments = new Map<string, SupplierBillPayment[]>();
  for (const line of lineResult.data ?? []) lines.set(line.bill_id, [...(lines.get(line.bill_id) ?? []), line]);
  for (const payment of paymentResult.data ?? []) payments.set(payment.bill_id, [...(payments.get(payment.bill_id) ?? []), payment]);
  return (billResult.data ?? []).map((bill) => {
    const billLines = lines.get(bill.id) ?? [];
    const billPayments = payments.get(bill.id) ?? [];
    const total = billLines.reduce((sum, line) => sum.plus(line.net_amount).plus(line.vat_amount), new Decimal(0));
    const paid = billPayments.reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
    return { ...bill, lines: billLines, payments: billPayments, supplier_name: suppliers.get(bill.supplier_id) ?? "Unknown supplier", total: total.toFixed(4), paid_total: paid.toFixed(4), outstanding: total.minus(paid).toFixed(4) };
  });
}

export async function saveSupplierBill(input: unknown, actorId: string): Promise<string> {
  const bill = supplierBillSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("save_supplier_bill", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_supplier_id: bill.supplier_id,
    p_bill_number: bill.bill_number, p_bill_date: bill.bill_date, p_due_date: bill.due_date,
    p_description: bill.description ?? "", p_bill_id: bill.id,
    p_lines: bill.lines.map((line) => ({ ...line, vat_amount: line.vat_amount || "0" })),
  });
  throwOnError(error, "Failed to save supplier bill");
  if (!data) throw new Error("The database did not return the saved bill ID.");
  return data;
}

const numberedResultSchema = z.object({ id: z.string().uuid(), entry_number: z.string().min(1) });

export async function postSupplierBill(billId: string, actorId: string): Promise<NumberedJournalEntry> {
  const id = z.string().uuid().parse(billId);
  const { data, error } = await createAdminClient().rpc("post_supplier_bill", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_bill_id: id,
  });
  throwOnError(error, "Failed to post supplier bill");
  return numberedResultSchema.parse(data);
}

export async function recordSupplierBillPayment(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const payment = supplierBillPaymentSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("record_supplier_bill_payment", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_bill_id: payment.bill_id,
    p_payment_date: payment.payment_date, p_bank_account_id: payment.bank_account_id,
    p_amount: payment.amount as unknown as number,
  });
  throwOnError(error, "Failed to record supplier bill payment");
  return numberedResultSchema.parse(data);
}

export async function listBankReconciliations(): Promise<BankReconciliation[]> {
  const client = createAdminClient();
  const [{ data, error }, accounts] = await Promise.all([
    client.from("accounting_bank_reconciliations").select("id, tenant_id, bank_account_id, period_start, period_end, opening_balance::text, closing_balance::text, status, created_by, completed_by, completed_at, created_at")
      .eq("tenant_id", SCORPBOOK_TENANT_ID).order("period_end", { ascending: false }).limit(100),
    listAccounts(),
  ]);
  throwOnError(error, "Failed to load bank reconciliations");
  const accountNames = new Map(accounts.map((account) => [account.id, `${account.code} · ${account.name}`]));
  return (data ?? []).map((item) => ({ ...item, bank_account_name: accountNames.get(item.bank_account_id) ?? "Unknown account" }));
}

export async function getBankReconciliationDetail(reconciliationId: string): Promise<BankReconciliationDetail | null> {
  const id = z.string().uuid().parse(reconciliationId);
  const client = createAdminClient();
  const { data: reconciliation, error } = await client.from("accounting_bank_reconciliations")
    .select("id, tenant_id, bank_account_id, period_start, period_end, opening_balance::text, closing_balance::text, status, created_by, completed_by, completed_at, created_at")
    .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", id).maybeSingle();
  throwOnError(error, "Failed to load bank reconciliation");
  if (!reconciliation) return null;
  const [accountResult, lineResult, entryResult, matchedResult] = await Promise.all([
    client.from("accounting_accounts").select("code, name").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", reconciliation.bank_account_id).single(),
    client.from("accounting_bank_statement_lines").select("id, tenant_id, reconciliation_id, line_number, transaction_date, description, bank_reference, matched_journal_line_id, matched_by, matched_at, created_at, amount::text")
      .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("reconciliation_id", id).order("transaction_date").order("line_number"),
    client.from("accounting_journal_entries").select("id, entry_number, entry_date, description")
      .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("status", "POSTED").gte("entry_date", reconciliation.period_start).lte("entry_date", reconciliation.period_end),
    client.from("accounting_bank_statement_lines").select("id, reconciliation_id, matched_journal_line_id")
      .eq("tenant_id", SCORPBOOK_TENANT_ID).not("matched_journal_line_id", "is", null),
  ]);
  throwOnError(accountResult.error, "Failed to read bank account");
  if (!accountResult.data) throw new Error("The reconciliation bank account could not be found.");
  throwOnError(lineResult.error, "Failed to load bank statement lines");
  throwOnError(entryResult.error, "Failed to load posted journal entries");
  throwOnError(matchedResult.error, "Failed to load existing statement matches");
  const entryIds = (entryResult.data ?? []).map((entry) => entry.id);
  const journalLines = entryIds.length ? await client.from("accounting_journal_lines")
    .select("id, entry_id, description, debit::text, credit::text").eq("tenant_id", SCORPBOOK_TENANT_ID)
    .eq("account_id", reconciliation.bank_account_id).in("entry_id", entryIds) : { data: [], error: null };
  throwOnError(journalLines.error, "Failed to load bank ledger lines");
  const entryMap = new Map((entryResult.data ?? []).map((entry) => [entry.id, entry]));
  const matchMap = new Map((matchedResult.data ?? []).filter((match) => match.matched_journal_line_id)
    .map((match) => [match.matched_journal_line_id!, match]));
  const candidateList: BankJournalCandidate[] = (journalLines.data ?? []).flatMap((line) => {
    const entry = entryMap.get(line.entry_id);
    if (!entry) return [];
    const match = matchMap.get(line.id);
    return [{ id: line.id, entry_id: line.entry_id, entry_number: entry.entry_number, entry_date: entry.entry_date,
      entry_description: entry.description, description: line.description, debit: line.debit, credit: line.credit,
      matched_statement_line_id: match?.reconciliation_id === id ? match.id : (match?.id ?? null) }];
  }).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.entry_number.localeCompare(b.entry_number));
  const candidateById = new Map(candidateList.map((candidate) => [candidate.id, candidate]));
  const lines: BankStatementLine[] = (lineResult.data ?? []).map((line) => ({
    ...line,
    matched_entry_number: line.matched_journal_line_id ? candidateById.get(line.matched_journal_line_id)?.entry_number ?? null : null,
  }));
  return { reconciliation: { ...reconciliation, bank_account_name: `${accountResult.data.code} · ${accountResult.data.name}` }, lines, candidates: candidateList };
}

export async function createBankReconciliation(input: unknown, actorId: string): Promise<string> {
  const data = bankReconciliationSchema.parse(input);
  const { data: id, error } = await createAdminClient().rpc("create_bank_reconciliation", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_bank_account_id: data.bank_account_id,
    p_period_start: data.period_start, p_period_end: data.period_end,
    p_opening_balance: data.opening_balance as unknown as number,
    p_closing_balance: data.closing_balance as unknown as number,
  });
  throwOnError(error, "Failed to create bank reconciliation");
  if (!id) throw new Error("The database did not return the reconciliation ID.");
  return id;
}

export async function importBankStatementLines(reconciliationId: string, input: unknown, actorId: string): Promise<number> {
  const id = z.string().uuid().parse(reconciliationId);
  const rows = bankStatementRowsSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("import_bank_statement_lines", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_reconciliation_id: id, p_rows: rows as unknown as Json,
  });
  throwOnError(error, "Failed to import bank statement");
  return data ?? 0;
}

export async function matchBankStatementLine(input: unknown, actorId: string): Promise<void> {
  const match = bankMatchSchema.parse(input);
  const { error } = await createAdminClient().rpc("match_bank_statement_line", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId,
    p_statement_line_id: match.statement_line_id, p_journal_line_id: match.journal_line_id,
  });
  throwOnError(error, "Failed to match bank statement line");
}

export async function unmatchBankStatementLine(input: unknown, actorId: string): Promise<void> {
  const { statement_line_id } = bankStatementLineIdSchema.parse(input);
  const { error } = await createAdminClient().rpc("unmatch_bank_statement_line", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_statement_line_id: statement_line_id,
  });
  throwOnError(error, "Failed to remove bank statement match");
}

export async function completeBankReconciliation(input: unknown, actorId: string): Promise<void> {
  const { reconciliation_id } = completeBankReconciliationSchema.parse(input);
  const { error } = await createAdminClient().rpc("complete_bank_reconciliation", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_actor_id: actorId, p_reconciliation_id: reconciliation_id,
  });
  throwOnError(error, "Failed to complete bank reconciliation");
}

export async function getTrialBalance(asOfDate: string): Promise<TrialBalanceRow[]> {
  const date = z.iso.date().parse(asOfDate);
  const { data, error } = await createAdminClient().rpc("get_trial_balance", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_as_of_date: date,
  });
  throwOnError(error, "Failed to load trial balance");
  return z.array(z.object({
    account_id: z.string().uuid(),
    account_code: z.string(),
    account_name: z.string(),
    account_type: z.string(),
    is_active: z.boolean(),
    debit_activity: z.string(),
    credit_activity: z.string(),
    debit_balance: z.string(),
    credit_balance: z.string(),
  })).parse(data ?? []);
}

export async function getIncomeStatement(startDate: string, endDate: string): Promise<IncomeStatementRow[]> {
  const start = z.iso.date().parse(startDate);
  const end = z.iso.date().parse(endDate);
  if (start > end) throw new Error("The start date must be on or before the end date.");
  const { data, error } = await createAdminClient().rpc("get_income_statement", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_start_date: start,
    p_end_date: end,
  });
  throwOnError(error, "Failed to load income statement");
  return z.array(z.object({
    account_id: z.string().uuid(),
    account_code: z.string(),
    account_name: z.string(),
    account_type: z.enum(["REVENUE", "EXPENSE"]),
    amount: z.string(),
  })).parse(data ?? []);
}

export async function getBalanceSheet(asOfDate: string): Promise<BalanceSheetData> {
  const date = z.iso.date().parse(asOfDate);
  const { data, error } = await createAdminClient().rpc("get_balance_sheet", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_as_of_date: date,
  });
  throwOnError(error, "Failed to load balance sheet");
  return z.object({
    accounts: z.array(z.object({
      account_id: z.string().uuid(),
      account_code: z.string(),
      account_name: z.string(),
      account_type: z.enum(["ASSET", "LIABILITY", "EQUITY"]),
      is_active: z.boolean(),
      amount: z.string(),
    })),
    current_earnings: z.string(),
  }).parse(data);
}

export async function saveAccount(input: unknown): Promise<void> {
  const account = accountSchema.parse(input);
  const client = createAdminClient();
  if (account.id) {
    const { data: existing, error: readError } = await client.from("accounting_accounts")
      .select("id, code, type").eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", account.id).single();
    throwOnError(readError, "Failed to read account");
    if (!existing) throw new Error("The account to update could not be found.");
    if (existing.code !== account.code || existing.type !== account.type) {
      throw new Error("Account codes and types cannot be changed after creation, to preserve historical reporting.");
    }
    const { error } = await client.from("accounting_accounts")
      .update({ name: account.name, is_active: account.is_active })
      .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("id", account.id);
    throwOnError(error, "Failed to update account");
    return;
  }
  const { error } = await client.from("accounting_accounts").insert({
    tenant_id: SCORPBOOK_TENANT_ID,
    code: account.code,
    name: account.name,
    type: account.type,
    is_active: account.is_active,
  });
  throwOnError(error, "Failed to create account");
}

export async function listJournalEntries(): Promise<Array<JournalEntry & { lines: ExactJournalLine[] }>> {
  const client = createAdminClient();
  const { data: entries, error } = await client.from("accounting_journal_entries")
    .select("*").eq("tenant_id", SCORPBOOK_TENANT_ID).order("entry_date", { ascending: false })
    .order("created_at", { ascending: false }).limit(100);
  throwOnError(error, "Failed to load journal entries");
  if (!entries?.length) return [];
  const { data: lines, error: lineError } = await client.from("accounting_journal_lines")
    .select("id, tenant_id, entry_id, account_id, description, created_at, debit::text, credit::text")
    .eq("tenant_id", SCORPBOOK_TENANT_ID).in("entry_id", entries.map((entry) => entry.id));
  throwOnError(lineError, "Failed to load journal lines");
  const byEntry = new Map<string, ExactJournalLine[]>();
  for (const line of lines ?? []) byEntry.set(line.entry_id, [...(byEntry.get(line.entry_id) ?? []), line]);
  return entries.map((entry) => ({ ...entry, lines: byEntry.get(entry.id) ?? [] }));
}

export async function suggestJournalEntryNumber(entryDate: string): Promise<string> {
  const date = z.iso.date().parse(entryDate);
  const { data, error } = await createAdminClient().rpc("suggest_journal_entry_number", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_entry_date: date,
  });
  throwOnError(error, "Failed to suggest journal entry number");
  if (!data) throw new Error("The database did not return a suggested entry number.");
  return data;
}

export async function saveDraftJournal(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const entry = journalSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("save_draft_journal_entry_numbered", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
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
    p_requested_entry_number: entry.entry_number,
  });
  throwOnError(error, "Failed to save draft");
  return numberedJournalEntrySchema.parse(data);
}

export async function postJournal(input: unknown, actorId: string): Promise<void> {
  const { entry_id } = postSchema.parse(input);
  const { error } = await createAdminClient().rpc("post_journal_entry", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_entry_id: entry_id,
    p_actor_id: actorId,
  });
  throwOnError(error, "Failed to post journal entry");
}

export async function reverseJournal(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const reversal = reverseSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("reverse_journal_entry_numbered", {
    p_tenant_id: SCORPBOOK_TENANT_ID,
    p_entry_id: reversal.entry_id,
    p_reversal_date: reversal.reversal_date,
    p_description: reversal.description || undefined,
    p_actor_id: actorId,
    p_requested_entry_number: reversal.reversal_entry_number,
  });
  throwOnError(error, "Failed to reverse journal entry");
  return numberedJournalEntrySchema.parse(data);
}
