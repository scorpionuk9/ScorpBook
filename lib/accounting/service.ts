import "server-only";

import type { Json, Tables } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";
import { currentTenantId } from "@/lib/accounting/auth";
import { z } from "zod";
import { accountSchema, bankFeedCategoriseSchema, bankFeedImportSchema, guidedTransactionSchema, vatPeriodSchema, bankMatchSchema, bankReconciliationSchema, bankStatementLineIdSchema, bankStatementRowsSchema, completeBankReconciliationSchema, journalSchema, postSchema, reverseSchema, supplierBillPaymentSchema, supplierBillSchema, supplierSchema } from "@/lib/accounting/schemas";
import Decimal from "decimal.js";
import { buildGuidedTransaction } from "@/lib/accounting/guided";
import { scenariosFor, toGuidedInput, type BankFeedLine, type BankRule } from "@/lib/accounting/bank-inbox";

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
export type AccountingPeriod = Tables<"accounting_periods">;

const numberedJournalEntrySchema = z.object({ id: z.string().uuid(), entry_number: z.string().min(1) });

function throwOnError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(`${fallback}：${error.message}`);
}

export async function listAccounts(): Promise<Account[]> {
  const tenant = await currentTenantId();
  const { data, error } = await createAdminClient().from("accounting_accounts")
    .select("*").eq("tenant_id", tenant).order("code");
  throwOnError(error, "Failed to load accounts");
  return data ?? [];
}

export async function listSuppliers(): Promise<Supplier[]> {
  const tenant = await currentTenantId();
  const { data, error } = await createAdminClient().from("accounting_suppliers")
    .select("*").eq("tenant_id", tenant).order("name").order("supplier_code");
  throwOnError(error, "Failed to load suppliers");
  return data ?? [];
}

export async function suggestSupplierCode(): Promise<string> {
  const tenant = await currentTenantId();
  const { data, error } = await createAdminClient().rpc("suggest_supplier_code", {
    p_tenant_id: tenant,
  });
  throwOnError(error, "Failed to suggest supplier code");
  if (!data) throw new Error("The database did not return a supplier code suggestion.");
  return data;
}

export async function saveSupplier(input: unknown, actorId: string): Promise<string> {
  const tenant = await currentTenantId();
  const supplier = supplierSchema.parse(input);
  const client = createAdminClient();
  if (supplier.default_expense_account_id) {
    const { data: expenseAccount, error } = await client.from("accounting_accounts")
      .select("id").eq("tenant_id", tenant).eq("id", supplier.default_expense_account_id)
      .eq("type", "EXPENSE").eq("is_active", true).maybeSingle();
    throwOnError(error, "Failed to validate default expense account");
    if (!expenseAccount) throw new Error("Choose an active expense account for this supplier.");
  }

  const { data, error } = await client.rpc("save_accounting_supplier", {
    p_tenant_id: tenant,
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
    .select("supplier_code").eq("tenant_id", tenant).eq("id", data).single();
  throwOnError(readError, "Failed to read the saved supplier code");
  if (!savedSupplier) throw new Error("The saved supplier could not be found.");
  return savedSupplier.supplier_code;
}

export async function listSupplierBills(): Promise<SupplierBill[]> {
  const tenant = await currentTenantId();
  const client = createAdminClient();
  const billResult = await client.from("accounting_supplier_bills").select("*").eq("tenant_id", tenant)
    .order("bill_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  throwOnError(billResult.error, "Failed to load supplier bills");
  if (!billResult.data?.length) return [];
  const billIds = billResult.data.map((bill) => bill.id);
  const [supplierResult, lineResult, paymentResult] = await Promise.all([
    client.from("accounting_suppliers").select("id, name").eq("tenant_id", tenant),
    client.from("accounting_supplier_bill_lines").select("id, tenant_id, bill_id, expense_account_id, description, created_at, net_amount::text, vat_amount::text")
      .eq("tenant_id", tenant).in("bill_id", billIds),
    client.from("accounting_supplier_bill_payments").select("id, tenant_id, bill_id, payment_date, bank_account_id, journal_entry_id, created_by, created_at, amount::text")
      .eq("tenant_id", tenant).in("bill_id", billIds),
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
  const tenant = await currentTenantId();
  const bill = supplierBillSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("save_supplier_bill", {
    p_tenant_id: tenant, p_actor_id: actorId, p_supplier_id: bill.supplier_id,
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
  const tenant = await currentTenantId();
  const id = z.string().uuid().parse(billId);
  const { data, error } = await createAdminClient().rpc("post_supplier_bill", {
    p_tenant_id: tenant, p_actor_id: actorId, p_bill_id: id,
  });
  throwOnError(error, "Failed to post supplier bill");
  return numberedResultSchema.parse(data);
}

export async function recordSupplierBillPayment(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const tenant = await currentTenantId();
  const payment = supplierBillPaymentSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("record_supplier_bill_payment", {
    p_tenant_id: tenant, p_actor_id: actorId, p_bill_id: payment.bill_id,
    p_payment_date: payment.payment_date, p_bank_account_id: payment.bank_account_id,
    p_amount: payment.amount as unknown as number,
  });
  throwOnError(error, "Failed to record supplier bill payment");
  return numberedResultSchema.parse(data);
}

export async function listBankReconciliations(): Promise<BankReconciliation[]> {
  const tenant = await currentTenantId();
  const client = createAdminClient();
  const [{ data, error }, accounts] = await Promise.all([
    client.from("accounting_bank_reconciliations").select("id, tenant_id, bank_account_id, period_start, period_end, opening_balance::text, closing_balance::text, status, created_by, completed_by, completed_at, created_at")
      .eq("tenant_id", tenant).order("period_end", { ascending: false }).limit(100),
    listAccounts(),
  ]);
  throwOnError(error, "Failed to load bank reconciliations");
  const accountNames = new Map(accounts.map((account) => [account.id, `${account.code} · ${account.name}`]));
  return (data ?? []).map((item) => ({ ...item, bank_account_name: accountNames.get(item.bank_account_id) ?? "Unknown account" }));
}

export async function getBankReconciliationDetail(reconciliationId: string): Promise<BankReconciliationDetail | null> {
  const tenant = await currentTenantId();
  const id = z.string().uuid().parse(reconciliationId);
  const client = createAdminClient();
  const { data: reconciliation, error } = await client.from("accounting_bank_reconciliations")
    .select("id, tenant_id, bank_account_id, period_start, period_end, opening_balance::text, closing_balance::text, status, created_by, completed_by, completed_at, created_at")
    .eq("tenant_id", tenant).eq("id", id).maybeSingle();
  throwOnError(error, "Failed to load bank reconciliation");
  if (!reconciliation) return null;
  const [accountResult, lineResult, entryResult, matchedResult] = await Promise.all([
    client.from("accounting_accounts").select("code, name").eq("tenant_id", tenant).eq("id", reconciliation.bank_account_id).single(),
    client.from("accounting_bank_statement_lines").select("id, tenant_id, reconciliation_id, line_number, transaction_date, description, bank_reference, matched_journal_line_id, matched_by, matched_at, created_at, amount::text")
      .eq("tenant_id", tenant).eq("reconciliation_id", id).order("transaction_date").order("line_number"),
    client.from("accounting_journal_entries").select("id, entry_number, entry_date, description")
      .eq("tenant_id", tenant).eq("status", "POSTED").gte("entry_date", reconciliation.period_start).lte("entry_date", reconciliation.period_end),
    client.from("accounting_bank_statement_lines").select("id, reconciliation_id, matched_journal_line_id")
      .eq("tenant_id", tenant).not("matched_journal_line_id", "is", null),
  ]);
  throwOnError(accountResult.error, "Failed to read bank account");
  if (!accountResult.data) throw new Error("The reconciliation bank account could not be found.");
  throwOnError(lineResult.error, "Failed to load bank statement lines");
  throwOnError(entryResult.error, "Failed to load posted journal entries");
  throwOnError(matchedResult.error, "Failed to load existing statement matches");
  const entryIds = (entryResult.data ?? []).map((entry) => entry.id);
  const journalLines = entryIds.length ? await client.from("accounting_journal_lines")
    .select("id, entry_id, description, debit::text, credit::text").eq("tenant_id", tenant)
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
  const tenant = await currentTenantId();
  const data = bankReconciliationSchema.parse(input);
  const { data: id, error } = await createAdminClient().rpc("create_bank_reconciliation", {
    p_tenant_id: tenant, p_actor_id: actorId, p_bank_account_id: data.bank_account_id,
    p_period_start: data.period_start, p_period_end: data.period_end,
    p_opening_balance: data.opening_balance as unknown as number,
    p_closing_balance: data.closing_balance as unknown as number,
  });
  throwOnError(error, "Failed to create bank reconciliation");
  if (!id) throw new Error("The database did not return the reconciliation ID.");
  return id;
}

export async function importBankStatementLines(reconciliationId: string, input: unknown, actorId: string): Promise<number> {
  const tenant = await currentTenantId();
  const id = z.string().uuid().parse(reconciliationId);
  const rows = bankStatementRowsSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("import_bank_statement_lines", {
    p_tenant_id: tenant, p_actor_id: actorId, p_reconciliation_id: id, p_rows: rows as unknown as Json,
  });
  throwOnError(error, "Failed to import bank statement");
  return data ?? 0;
}

export async function matchBankStatementLine(input: unknown, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const match = bankMatchSchema.parse(input);
  const { error } = await createAdminClient().rpc("match_bank_statement_line", {
    p_tenant_id: tenant, p_actor_id: actorId,
    p_statement_line_id: match.statement_line_id, p_journal_line_id: match.journal_line_id,
  });
  throwOnError(error, "Failed to match bank statement line");
}

export async function unmatchBankStatementLine(input: unknown, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const { statement_line_id } = bankStatementLineIdSchema.parse(input);
  const { error } = await createAdminClient().rpc("unmatch_bank_statement_line", {
    p_tenant_id: tenant, p_actor_id: actorId, p_statement_line_id: statement_line_id,
  });
  throwOnError(error, "Failed to remove bank statement match");
}

export async function completeBankReconciliation(input: unknown, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const { reconciliation_id } = completeBankReconciliationSchema.parse(input);
  const { error } = await createAdminClient().rpc("complete_bank_reconciliation", {
    p_tenant_id: tenant, p_actor_id: actorId, p_reconciliation_id: reconciliation_id,
  });
  throwOnError(error, "Failed to complete bank reconciliation");
}

export async function listAccountingPeriods(): Promise<AccountingPeriod[]> {
  const tenant = await currentTenantId();
  const { data, error } = await createAdminClient().from("accounting_periods").select("*")
    .eq("tenant_id", tenant).order("period_start", { ascending: false }).limit(100);
  throwOnError(error, "Failed to load accounting periods");
  return data ?? [];
}

export async function closeAccountingPeriod(periodId: string, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const id = z.string().uuid().parse(periodId);
  const { error } = await createAdminClient().rpc("close_accounting_period", {
    p_tenant_id: tenant, p_actor_id: actorId, p_period_id: id,
  });
  throwOnError(error, "Failed to close accounting period");
}

export async function getTrialBalance(asOfDate: string): Promise<TrialBalanceRow[]> {
  const tenant = await currentTenantId();
  const date = z.iso.date().parse(asOfDate);
  const { data, error } = await createAdminClient().rpc("get_trial_balance", {
    p_tenant_id: tenant,
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
  const tenant = await currentTenantId();
  const start = z.iso.date().parse(startDate);
  const end = z.iso.date().parse(endDate);
  if (start > end) throw new Error("The start date must be on or before the end date.");
  const { data, error } = await createAdminClient().rpc("get_income_statement", {
    p_tenant_id: tenant,
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
  const tenant = await currentTenantId();
  const date = z.iso.date().parse(asOfDate);
  const { data, error } = await createAdminClient().rpc("get_balance_sheet", {
    p_tenant_id: tenant,
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
  const tenant = await currentTenantId();
  const account = accountSchema.parse(input);
  const client = createAdminClient();
  if (account.id) {
    const { data: existing, error: readError } = await client.from("accounting_accounts")
      .select("id, code, type").eq("tenant_id", tenant).eq("id", account.id).single();
    throwOnError(readError, "Failed to read account");
    if (!existing) throw new Error("The account to update could not be found.");
    if (existing.code !== account.code || existing.type !== account.type) {
      throw new Error("Account codes and types cannot be changed after creation, to preserve historical reporting.");
    }
    const { error } = await client.from("accounting_accounts")
      .update({ name: account.name, is_active: account.is_active })
      .eq("tenant_id", tenant).eq("id", account.id);
    throwOnError(error, "Failed to update account");
    return;
  }
  const { error } = await client.from("accounting_accounts").insert({
    tenant_id: tenant,
    code: account.code,
    name: account.name,
    type: account.type,
    is_active: account.is_active,
  });
  throwOnError(error, "Failed to create account");
}

export async function listJournalEntries(): Promise<Array<JournalEntry & { lines: ExactJournalLine[] }>> {
  const tenant = await currentTenantId();
  const client = createAdminClient();
  const { data: entries, error } = await client.from("accounting_journal_entries")
    .select("*").eq("tenant_id", tenant).order("entry_date", { ascending: false })
    .order("created_at", { ascending: false }).limit(100);
  throwOnError(error, "Failed to load journal entries");
  if (!entries?.length) return [];
  const { data: lines, error: lineError } = await client.from("accounting_journal_lines")
    .select("id, tenant_id, entry_id, account_id, description, created_at, debit::text, credit::text")
    .eq("tenant_id", tenant).in("entry_id", entries.map((entry) => entry.id));
  throwOnError(lineError, "Failed to load journal lines");
  const byEntry = new Map<string, ExactJournalLine[]>();
  for (const line of lines ?? []) byEntry.set(line.entry_id, [...(byEntry.get(line.entry_id) ?? []), line]);
  return entries.map((entry) => ({ ...entry, lines: byEntry.get(entry.id) ?? [] }));
}

export async function suggestJournalEntryNumber(entryDate: string): Promise<string> {
  const tenant = await currentTenantId();
  const date = z.iso.date().parse(entryDate);
  const { data, error } = await createAdminClient().rpc("suggest_journal_entry_number", {
    p_tenant_id: tenant,
    p_entry_date: date,
  });
  throwOnError(error, "Failed to suggest journal entry number");
  if (!data) throw new Error("The database did not return a suggested entry number.");
  return data;
}

export async function saveDraftJournal(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const tenant = await currentTenantId();
  const entry = journalSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("save_draft_journal_entry_numbered", {
    p_tenant_id: tenant,
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
  const tenant = await currentTenantId();
  const { entry_id } = postSchema.parse(input);
  const { error } = await createAdminClient().rpc("post_journal_entry", {
    p_tenant_id: tenant,
    p_entry_id: entry_id,
    p_actor_id: actorId,
  });
  throwOnError(error, "Failed to post journal entry");
}

export async function reverseJournal(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const tenant = await currentTenantId();
  const reversal = reverseSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("reverse_journal_entry_numbered", {
    p_tenant_id: tenant,
    p_entry_id: reversal.entry_id,
    p_reversal_date: reversal.reversal_date,
    p_description: reversal.description || undefined,
    p_actor_id: actorId,
    p_requested_entry_number: reversal.reversal_entry_number,
  });
  throwOnError(error, "Failed to reverse journal entry");
  return numberedJournalEntrySchema.parse(data);
}

export type DashboardSummary = {
  balances: TrialBalanceRow[];
  draft_journal_count: number;
  draft_bill_count: number;
  overdue_bill_count: number;
  open_reconciliation_count: number;
  sync_attention_count: number;
  bank_inbox_count: number;
  closable_periods: AccountingPeriod[];
};

export async function getDashboardSummary(today: string): Promise<DashboardSummary> {
  const tenant = await currentTenantId();
  const date = z.iso.date().parse(today);
  const client = createAdminClient();
  const count = { count: "exact", head: true } as const;
  const [balances, drafts, draftBills, overdueBills, openReconciliations, periods, syncAttention, bankInbox] = await Promise.all([
    getTrialBalance(date),
    client.from("accounting_journal_entries").select("id", count).eq("tenant_id", tenant).eq("status", "DRAFT"),
    client.from("accounting_supplier_bills").select("id", count).eq("tenant_id", tenant).eq("status", "DRAFT"),
    client.from("accounting_supplier_bills").select("id", count).eq("tenant_id", tenant)
      .in("status", ["OPEN", "PARTIAL"]).lt("due_date", date),
    client.from("accounting_bank_reconciliations").select("id", count).eq("tenant_id", tenant).eq("status", "IN_PROGRESS"),
    client.from("accounting_periods").select("*").eq("tenant_id", tenant).eq("status", "OPEN")
      .lt("period_end", date).order("period_start"),
    client.from("webhook_events").select("id", count).eq("tenant_id", tenant)
      .eq("source_system", "SCORPINVOICE").eq("status", "NEEDS_ATTENTION"),
    client.from("accounting_bank_feed_lines").select("id", count).eq("tenant_id", tenant).eq("status", "NEW"),
  ]);
  throwOnError(drafts.error, "Failed to count draft journal entries");
  throwOnError(draftBills.error, "Failed to count draft bills");
  throwOnError(overdueBills.error, "Failed to count overdue bills");
  throwOnError(openReconciliations.error, "Failed to count open bank reconciliations");
  throwOnError(periods.error, "Failed to load open accounting periods");
  throwOnError(syncAttention.error, "Failed to count ScorpInvoice updates needing attention");
  throwOnError(bankInbox.error, "Failed to count bank transactions to categorise");
  return {
    balances,
    draft_journal_count: drafts.count ?? 0,
    draft_bill_count: draftBills.count ?? 0,
    overdue_bill_count: overdueBills.count ?? 0,
    open_reconciliation_count: openReconciliations.count ?? 0,
    sync_attention_count: syncAttention.count ?? 0,
    bank_inbox_count: bankInbox.count ?? 0,
    closable_periods: periods.data ?? [],
  };
}

export async function recordGuidedTransaction(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const tenant = await currentTenantId();
  const guided = guidedTransactionSchema.parse(input);
  // Rebuild the lines from current accounts; the browser preview is never trusted.
  const built = buildGuidedTransaction(guided, await listAccounts());
  if (!built.ok) throw new Error(built.error);
  const { data, error } = await createAdminClient().rpc("record_guided_transaction", {
    p_tenant_id: tenant, p_entry_date: guided.entry_date, p_lines: built.lines as unknown as Json,
    p_description: guided.description, p_scenario: guided.scenario, p_actor_id: actorId,
  });
  throwOnError(error, "Failed to record transaction");
  return numberedJournalEntrySchema.parse(data);
}

export type StoredBankFeedLine = BankFeedLine & { status: string; journal_entry_id: string | null; matched_journal_line_id: string | null; entry_number: string | null };
export type BankMatchCandidate = { journal_line_id: string; entry_id: string; entry_number: string; entry_date: string; description: string | null; amount: string; bank_account_id: string };

export async function listBankFeedLines(status: "NEW" | "DONE" | "IGNORED", limit = 200): Promise<StoredBankFeedLine[]> {
  const tenant = await currentTenantId();
  const client = createAdminClient();
  const { data, error } = await client.from("accounting_bank_feed_lines")
    .select("id, bank_account_id, transaction_date, description, reference, amount::text, status, journal_entry_id, matched_journal_line_id")
    .eq("tenant_id", tenant).eq("status", status)
    .order("transaction_date", { ascending: status === "NEW" }).order("imported_at").limit(limit);
  throwOnError(error, "Failed to load bank transactions");
  const rows = (data ?? []) as Array<Omit<StoredBankFeedLine, "entry_number">>;
  const entryIds = rows.flatMap((row) => row.journal_entry_id ? [row.journal_entry_id] : []);
  const numbers = new Map<string, string>();
  if (entryIds.length) {
    const entries = await client.from("accounting_journal_entries").select("id, entry_number").eq("tenant_id", tenant).in("id", entryIds);
    throwOnError(entries.error, "Failed to load linked entries");
    for (const entry of entries.data ?? []) numbers.set(entry.id, entry.entry_number);
  }
  return rows.map((row) => ({ ...row, entry_number: row.journal_entry_id ? numbers.get(row.journal_entry_id) ?? null : null }));
}

// Posted lines on the same bank account with the same amount within a week,
// not already linked to another bank line: likely the same money movement.
export async function listBankMatchCandidates(lines: BankFeedLine[]): Promise<Map<string, BankMatchCandidate[]>> {
  const tenant = await currentTenantId();
  const result = new Map<string, BankMatchCandidate[]>();
  if (!lines.length) return result;
  const client = createAdminClient();
  const dates = lines.map((line) => line.transaction_date).sort();
  const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const accountIds = [...new Set(lines.map((line) => line.bank_account_id))];
  const [entries, linked] = await Promise.all([
    client.from("accounting_journal_entries").select("id, entry_number, entry_date, description")
      .eq("tenant_id", tenant).eq("status", "POSTED")
      .gte("entry_date", shift(dates[0], -7)).lte("entry_date", shift(dates[dates.length - 1], 7)),
    client.from("accounting_bank_feed_lines").select("journal_entry_id").eq("tenant_id", tenant).not("journal_entry_id", "is", null),
  ]);
  throwOnError(entries.error, "Failed to load entries to match");
  throwOnError(linked.error, "Failed to load linked bank transactions");
  const used = new Set((linked.data ?? []).map((row) => row.journal_entry_id));
  const entryMap = new Map((entries.data ?? []).filter((entry) => !used.has(entry.id)).map((entry) => [entry.id, entry]));
  if (!entryMap.size) return result;
  const ledgerLines = await client.from("accounting_journal_lines").select("id, entry_id, account_id, debit::text, credit::text")
    .eq("tenant_id", tenant).in("account_id", accountIds).in("entry_id", [...entryMap.keys()]);
  throwOnError(ledgerLines.error, "Failed to load ledger lines to match");
  const candidates: BankMatchCandidate[] = (ledgerLines.data ?? []).map((line) => {
    const entry = entryMap.get(line.entry_id)!;
    return { journal_line_id: line.id, entry_id: entry.id, entry_number: entry.entry_number, entry_date: entry.entry_date, description: entry.description,
      amount: new Decimal(line.debit).minus(line.credit).toFixed(2), bank_account_id: line.account_id };
  });
  for (const line of lines) {
    const lineAmount = new Decimal(line.amount);
    const matches = candidates.filter((candidate) => candidate.bank_account_id === line.bank_account_id && lineAmount.eq(candidate.amount)
      && Math.abs(Date.parse(candidate.entry_date) - Date.parse(line.transaction_date)) <= 7 * 86_400_000)
      .sort((a, b) => Math.abs(Date.parse(a.entry_date) - Date.parse(line.transaction_date)) - Math.abs(Date.parse(b.entry_date) - Date.parse(line.transaction_date)));
    if (matches.length) result.set(line.id, matches.slice(0, 3));
  }
  return result;
}

export async function listBankRules(): Promise<BankRule[]> {
  const tenant = await currentTenantId();
  const { data, error } = await createAdminClient().from("accounting_bank_rules")
    .select("id, match_text, direction, scenario, account_id, owner_choice").eq("tenant_id", tenant).order("match_text");
  throwOnError(error, "Failed to load bank rules");
  return (data ?? []) as BankRule[];
}

export async function deleteBankRule(ruleId: string): Promise<void> {
  const tenant = await currentTenantId();
  const { error } = await createAdminClient().from("accounting_bank_rules").delete()
    .eq("tenant_id", tenant).eq("id", z.string().uuid().parse(ruleId));
  throwOnError(error, "Failed to delete rule");
}

export async function importBankFeed(input: unknown, actorId: string): Promise<{ imported: number; skipped: number }> {
  const tenant = await currentTenantId();
  const feed = bankFeedImportSchema.parse(input);
  const { data, error } = await createAdminClient().rpc("import_bank_feed_lines", {
    p_tenant_id: tenant, p_actor_id: actorId, p_bank_account_id: feed.bank_account_id, p_rows: feed.rows as unknown as Json,
  });
  throwOnError(error, "Failed to import bank statement");
  return z.object({ imported: z.number(), skipped: z.number() }).parse(data);
}

export async function categoriseBankFeedLine(input: unknown, actorId: string): Promise<NumberedJournalEntry> {
  const tenant = await currentTenantId();
  const choice = bankFeedCategoriseSchema.parse(input);
  const client = createAdminClient();
  const { data: line, error } = await client.from("accounting_bank_feed_lines")
    .select("id, bank_account_id, transaction_date, description, reference, amount::text, status")
    .eq("tenant_id", tenant).eq("id", choice.line_id).maybeSingle();
  throwOnError(error, "Failed to load bank transaction");
  if (!line || line.status !== "NEW") throw new Error("This bank transaction has already been dealt with.");
  if (!scenariosFor(line).includes(choice.scenario)) throw new Error("That option doesn't fit money going this way.");
  const built = buildGuidedTransaction(toGuidedInput(line, choice), await listAccounts());
  if (!built.ok) throw new Error(built.error);
  const { data, error: rpcError } = await client.rpc("categorise_bank_feed_line", {
    p_tenant_id: tenant, p_actor_id: actorId, p_line_id: line.id, p_lines: built.lines as unknown as Json,
    p_description: line.description, p_scenario: choice.scenario,
    p_rule: (choice.remember_text ? { match_text: choice.remember_text, account_id: choice.account_id, owner_choice: choice.owner_choice } : null) as unknown as Json,
  });
  throwOnError(rpcError, "Failed to record bank transaction");
  return numberedJournalEntrySchema.parse(data);
}

export async function matchBankFeedLine(lineId: string, journalLineId: string, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const { error } = await createAdminClient().rpc("match_bank_feed_line", {
    p_tenant_id: tenant, p_actor_id: actorId, p_line_id: z.string().uuid().parse(lineId), p_journal_line_id: z.string().uuid().parse(journalLineId),
  });
  throwOnError(error, "Failed to match bank transaction");
}

export async function setBankFeedLineIgnored(lineId: string, ignored: boolean, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const { error } = await createAdminClient().rpc("set_bank_feed_line_ignored", {
    p_tenant_id: tenant, p_actor_id: actorId, p_line_id: z.string().uuid().parse(lineId), p_ignored: ignored,
  });
  throwOnError(error, "Failed to update bank transaction");
}

export type VatBoxes = Record<"box1" | "box2" | "box3" | "box4" | "box5" | "box6" | "box7" | "box8" | "box9", string>;
export type FiledVatReturn = { id: string; period_start: string; period_end: string; boxes: VatBoxes; filed_at: string };
const vatBoxesSchema = z.object({ box1: z.string(), box2: z.string(), box3: z.string(), box4: z.string(), box5: z.string(), box6: z.string(), box7: z.string(), box8: z.string(), box9: z.string() });

export async function getVatReturn(start: string, end: string): Promise<VatBoxes> {
  const tenant = await currentTenantId();
  const period = vatPeriodSchema.parse({ start, end });
  const { data, error } = await createAdminClient().rpc("get_vat_return", { p_tenant_id: tenant, p_start: period.start, p_end: period.end });
  throwOnError(error, "Failed to calculate VAT return");
  return vatBoxesSchema.parse(data);
}

export async function listFiledVatReturns(): Promise<FiledVatReturn[]> {
  const tenant = await currentTenantId();
  const { data, error } = await createAdminClient().from("accounting_vat_returns").select("id, period_start, period_end, boxes, filed_at")
    .eq("tenant_id", tenant).order("period_start", { ascending: false });
  throwOnError(error, "Failed to load VAT returns");
  return (data ?? []).map((row) => ({ ...row, boxes: vatBoxesSchema.parse(row.boxes) }));
}

export async function fileVatReturn(start: string, end: string, actorId: string): Promise<void> {
  const tenant = await currentTenantId();
  const period = vatPeriodSchema.parse({ start, end });
  const { error } = await createAdminClient().rpc("file_vat_return", { p_tenant_id: tenant, p_actor_id: actorId, p_start: period.start, p_end: period.end });
  throwOnError(error, "Failed to mark VAT return as filed");
}
