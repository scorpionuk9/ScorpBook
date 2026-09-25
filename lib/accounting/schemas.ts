import { z } from "zod";
import Decimal from "decimal.js";
import { ACCOUNT_TYPES, ENTRY_SOURCES } from "@/lib/accounting/constants";

const amount = z.string().trim().regex(/^\d{1,11}(?:\.\d{1,4})?$/, "Enter a non-negative amount with up to 4 decimal places.").refine(
  (value) => new Decimal(value).lte("99999999999.9999"),
  "Amount exceeds the NUMERIC(15,4) limit.",
);

const signedAmount = z.string().trim().regex(/^-?\d{1,11}(?:\.\d{1,4})?$/, "Enter a signed amount with up to 4 decimal places.").refine(
  (value) => new Decimal(value).abs().lte("99999999999.9999"),
  "Amount exceeds the NUMERIC(15,4) limit.",
);

export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  type: z.enum(ACCOUNT_TYPES),
  is_active: z.boolean(),
});

export const supplierSchema = z.object({
  id: z.string().uuid().optional(),
  supplier_code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().max(254).optional().transform((value) => value || undefined).pipe(z.email().optional()),
  phone: z.string().trim().max(50).optional().transform((value) => value || undefined),
  tax_number: z.string().trim().max(100).optional().transform((value) => value || undefined),
  address: z.string().trim().max(1000).optional().transform((value) => value || undefined),
  default_expense_account_id: z.string().uuid().optional().transform((value) => value || undefined),
  is_active: z.boolean(),
});

export const journalSchema = z.object({
  entry_id: z.string().uuid().optional(),
  entry_number: z.string().trim().max(50).optional().transform((value) => value || undefined),
  entry_date: z.iso.date(),
  description: z.string().trim().max(2000).optional(),
  source_type: z.enum(ENTRY_SOURCES),
  lines: z.array(z.object({
    account_id: z.string().uuid(),
    description: z.string().trim().max(500).optional(),
    debit: amount,
    credit: amount,
  })).min(2).max(100),
}).superRefine((entry, ctx) => {
  entry.lines.forEach((line, index) => {
    const debit = new Decimal(line.debit);
    const credit = new Decimal(line.credit);
    if (debit.gt(0) === credit.gt(0)) {
      ctx.addIssue({ code: "custom", path: ["lines", index], message: "Each line must contain a debit or a credit, but not both." });
    }
  });
});

export const postSchema = z.object({ entry_id: z.string().uuid() });
export const reverseSchema = z.object({
  entry_id: z.string().uuid(),
  reversal_entry_number: z.string().trim().max(50).optional().transform((value) => value || undefined),
  reversal_date: z.iso.date(),
  description: z.string().trim().max(2000).optional(),
});

export const supplierBillSchema = z.object({
  id: z.string().uuid().optional(),
  supplier_id: z.string().uuid(),
  bill_number: z.string().trim().min(1).max(50),
  bill_date: z.iso.date(),
  due_date: z.iso.date(),
  description: z.string().trim().max(2000).optional(),
  lines: z.array(z.object({
    expense_account_id: z.string().uuid(),
    description: z.string().trim().min(1).max(500),
    net_amount: amount,
    vat_amount: amount,
  })).min(1).max(100),
}).superRefine((bill, ctx) => {
  if (bill.due_date < bill.bill_date) ctx.addIssue({ code: "custom", path: ["due_date"], message: "Due date cannot be before the bill date." });
  bill.lines.forEach((line, index) => {
    if (new Decimal(line.net_amount).lte(0)) ctx.addIssue({ code: "custom", path: ["lines", index, "net_amount"], message: "Net amount must be greater than zero." });
  });
});

export const supplierBillPaymentSchema = z.object({
  bill_id: z.string().uuid(),
  payment_date: z.iso.date(),
  bank_account_id: z.string().uuid(),
  amount: amount.refine((value) => new Decimal(value).gt(0), "Payment amount must be greater than zero."),
});

export const bankReconciliationSchema = z.object({
  bank_account_id: z.string().uuid(),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  opening_balance: signedAmount,
  closing_balance: signedAmount,
}).superRefine((value, ctx) => {
  if (value.period_start > value.period_end) ctx.addIssue({ code: "custom", path: ["period_end"], message: "Period end must be on or after the start date." });
});

export const bankStatementRowsSchema = z.array(z.object({
  transaction_date: z.iso.date(),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(150).optional(),
  amount: signedAmount.refine((value) => new Decimal(value).isZero() === false, "Amount must not be zero."),
})).min(1).max(5000);

export const bankMatchSchema = z.object({ statement_line_id: z.string().uuid(), journal_line_id: z.string().uuid() });
export const bankStatementLineIdSchema = z.object({ statement_line_id: z.string().uuid() });
export const completeBankReconciliationSchema = z.object({ reconciliation_id: z.string().uuid() });
