"use server";

import { revalidatePath } from "next/cache";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { postJournal, reverseJournal, saveAccount, saveDraftJournal } from "@/lib/accounting/service";

export type ActionResult = { ok: boolean; message: string; id?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "發生未預期錯誤，請稍後再試。";
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
    return { ok: true, message: "科目已儲存。" };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function saveDraftAction(input: unknown): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const id = await saveDraftJournal(input, user.id);
    revalidatePath("/journal");
    return { ok: true, message: "日記帳草稿已儲存。", id };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function postJournalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const entry_id = String(formData.get("entry_id") || "");
    await postJournal({ entry_id }, user.id);
    revalidatePath("/journal");
    return { ok: true, message: "憑證已過帳。" };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}

export async function reverseJournalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireAccountingUser();
  try {
    const id = await reverseJournal({
      entry_id: String(formData.get("entry_id") || ""),
      reversal_entry_number: String(formData.get("reversal_entry_number") || ""),
      reversal_date: String(formData.get("reversal_date") || ""),
      description: String(formData.get("description") || "") || undefined,
    }, user.id);
    revalidatePath("/journal");
    return { ok: true, message: `沖銷憑證已建立並過帳（${id}）。` };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}
