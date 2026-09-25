import { z } from "zod";
import Decimal from "decimal.js";
import { ACCOUNT_TYPES, ENTRY_SOURCES } from "@/lib/accounting/constants";

const amount = z.string().trim().regex(/^\d{1,11}(?:\.\d{1,4})?$/, "金額最多 4 位小數且不可為負數").refine(
  (value) => new Decimal(value).lte("99999999999.9999"),
  "金額超出 NUMERIC(15,4) 範圍",
);

export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  type: z.enum(ACCOUNT_TYPES),
  is_active: z.boolean(),
});

export const journalSchema = z.object({
  entry_id: z.string().uuid().optional(),
  entry_number: z.string().trim().min(1).max(50),
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
      ctx.addIssue({ code: "custom", path: ["lines", index], message: "每行只能填借方或貸方其中一邊" });
    }
  });
});

export const postSchema = z.object({ entry_id: z.string().uuid() });
export const reverseSchema = z.object({
  entry_id: z.string().uuid(),
  reversal_entry_number: z.string().trim().min(1).max(50),
  reversal_date: z.iso.date(),
  description: z.string().trim().max(2000).optional(),
});
