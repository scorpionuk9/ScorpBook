"use server";

import { revalidatePath } from "next/cache";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { categoriseBankFeedLine, deleteBankRule, fileVatReturn, importBankFeed, matchBankFeedLine, setBankFeedLineIgnored } from "@/lib/accounting/service";
import type { ActionResult } from "@/app/actions/accounting";

function failure(error: unknown): ActionResult {
  return { ok: false, message: error instanceof Error ? error.message : "Something went wrong. Please try again." };
}

function refreshBanking() {
  revalidatePath("/banking/inbox");
  revalidatePath("/dashboard");
  revalidatePath("/journal");
}

export async function importBankFeedAction(input: unknown): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const { imported, skipped } = await importBankFeed(input, user.id);
    refreshBanking();
    return { ok: true, message: `Imported ${imported} transaction${imported === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} already imported` : ""}.` };
  } catch (error) { return failure(error); }
}

export async function categoriseBankFeedLineAction(input: unknown): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const entry = await categoriseBankFeedLine(input, user.id);
    refreshBanking();
    return { ok: true, message: `Recorded as ${entry.entry_number}.`, id: entry.id, entry_number: entry.entry_number };
  } catch (error) { return failure(error); }
}

export async function matchBankFeedLineAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    await matchBankFeedLine(String(formData.get("line_id") || ""), String(formData.get("journal_line_id") || ""), user.id);
    refreshBanking();
    return { ok: true, message: "Matched." };
  } catch (error) { return failure(error); }
}

export async function setBankFeedLineIgnoredAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    await setBankFeedLineIgnored(String(formData.get("line_id") || ""), formData.get("ignored") === "true", user.id);
    refreshBanking();
    return { ok: true, message: "Updated." };
  } catch (error) { return failure(error); }
}

export async function deleteBankRuleAction(formData: FormData): Promise<ActionResult> {
  await requireAccountingUser();
  try {
    await deleteBankRule(String(formData.get("rule_id") || ""));
    revalidatePath("/banking/inbox");
    return { ok: true, message: "Rule removed." };
  } catch (error) { return failure(error); }
}

export async function fileVatReturnAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    await fileVatReturn(String(formData.get("start") || ""), String(formData.get("end") || ""), user.id);
    revalidatePath("/reports/vat-return");
    return { ok: true, message: "Marked as filed." };
  } catch (error) { return failure(error); }
}
