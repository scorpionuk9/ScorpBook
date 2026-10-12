"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { COMPANY_COOKIE, currentTenantId, getAccountingContext, requireAccountingUser } from "@/lib/accounting/auth";
import { linkScorpInvoiceAccount, readConnectToken, retryScorpInvoiceEvent, unlinkScorpInvoiceAccount } from "@/lib/integrations/scorpinvoice";
import type { ActionResult } from "@/app/actions/accounting";

export async function retryScorpInvoiceEventAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAccountingUser("ACCOUNTANT");
    const result = await retryScorpInvoiceEvent(await currentTenantId(), String(formData.get("id") || ""));
    revalidatePath("/integrations/scorpinvoice");
    revalidatePath("/dashboard");
    revalidatePath("/journal");
    if (result.status === "NEEDS_ATTENTION") return { ok: false, message: result.error ?? "It still couldn't be recorded." };
    return { ok: true, message: result.status === "STALE" ? "A newer update has already been recorded." : "Recorded." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Retry failed. Please try again." };
  }
}

export async function unlinkScorpInvoiceAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAccountingUser("OWNER");
    await unlinkScorpInvoiceAccount(await currentTenantId(), String(formData.get("scorpinvoice_user_id") || ""));
    revalidatePath("/integrations/scorpinvoice");
    return { ok: true, message: "Disconnected." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not disconnect. Please try again." };
  }
}

export async function linkScorpInvoiceAction(formData: FormData): Promise<ActionResult> {
  try {
    const { user, companies } = await getAccountingContext();
    const company = companies.find((item) => item.id === String(formData.get("company_id") || ""));
    if (!company || company.role !== "OWNER") throw new Error("Only a business's Owner can connect ScorpInvoice to it.");
    const request = readConnectToken(String(formData.get("token") || ""));
    if (!request) throw new Error("This connection link has expired. Start again from ScorpInvoice.");
    const queued = await linkScorpInvoiceAccount(company.id, request, user.id, formData.get("backfill") === "on");
    (await cookies()).set(COMPANY_COOKIE, company.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    revalidatePath("/integrations/scorpinvoice");
    return { ok: true, message: queued ? `Connected. ${queued} existing record${queued === 1 ? "" : "s"} will arrive within a few minutes.` : "Connected." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not connect. Please try again." };
  }
}
