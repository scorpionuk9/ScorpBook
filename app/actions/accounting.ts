"use server";

import { revalidatePath } from "next/cache";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { postJournal, reverseJournal, saveAccount, saveDraftJournal, saveSupplier, suggestJournalEntryNumber } from "@/lib/accounting/service";

export type ActionResult = { ok: boolean; message: string; id?: string; entry_number?: string; supplier_code?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
}

export async function saveAccountAction(formData: FormData): Promise<ActionResult> {
  await requireAccountingUser();
  try {
    await saveAccount({
      id: String(formData.get("id") || "") || undefined,
      code: String(formData.get("code") || ""),
      name: String(formData.get("name") || ""),
      type: String(formData.get("type") || ""),
      is_active: formData.get("is_active") === "on",
    });
    revalidatePath("/accounts");
    return { ok: true, message: "Account saved." };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function saveSupplierAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const id = String(formData.get("id") || "") || undefined;
    const supplier_code = await saveSupplier({
      id,
      supplier_code: String(formData.get("supplier_code") || ""),
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      tax_number: String(formData.get("tax_number") || ""),
      address: String(formData.get("address") || ""),
      default_expense_account_id: String(formData.get("default_expense_account_id") || "") || undefined,
      is_active: id ? formData.get("is_active") === "on" : true,
    }, user.id);
    revalidatePath("/suppliers");
    return { ok: true, message: `Supplier ${supplier_code} saved.`, supplier_code };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function saveDraftAction(input: unknown): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const saved = await saveDraftJournal(input, user.id);
    revalidatePath("/journal");
    return { ok: true, message: `Journal draft saved as ${saved.entry_number}.`, id: saved.id, entry_number: saved.entry_number };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function suggestEntryNumberAction(entryDate: string): Promise<ActionResult> {
  await requireAccountingUser();
  try {
    const entry_number = await suggestJournalEntryNumber(entryDate);
    return { ok: true, message: "", entry_number };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function postJournalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const entry_id = String(formData.get("entry_id") || "");
    await postJournal({ entry_id }, user.id);
    revalidatePath("/journal");
    return { ok: true, message: "Journal entry posted." };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function reverseJournalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const reversed = await reverseJournal({
      entry_id: String(formData.get("entry_id") || ""),
      reversal_entry_number: String(formData.get("reversal_entry_number") || ""),
      reversal_date: String(formData.get("reversal_date") || ""),
      description: String(formData.get("description") || "") || undefined,
    }, user.id);
    revalidatePath("/journal");
    return { ok: true, message: `Reversal entry ${reversed.entry_number} created and posted.`, id: reversed.id, entry_number: reversed.entry_number };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}
