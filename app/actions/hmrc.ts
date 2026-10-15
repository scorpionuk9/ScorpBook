"use server";

import { revalidatePath } from "next/cache";
import { getAccountingContext, requireAccountingUser } from "@/lib/accounting/auth";
import { getVatReturn, type VatBoxes } from "@/lib/accounting/service";
import { createAdminClient } from "@/lib/supabase/server";
import { hmrcEnvironment, mtdVatAvailableFor } from "@/lib/hmrc/config";
import { clientInfoSchema, fraudPreventionHeaders } from "@/lib/hmrc/fraud";
import { disconnectHmrc } from "@/lib/hmrc/oauth";
import { incomingHeaderNames, requestNetwork, sessionMultiFactor } from "@/lib/hmrc/request";
import { submitVatReturn, validateFraudHeaders, vatObligations, type VatObligation, type VatReceipt } from "@/lib/hmrc/vat";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const fail = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof Error ? error.message : "Something went wrong. Please try again." });

// Shared checks: an Accountant or Owner of a business that can use MTD VAT and has a VAT number.
async function mtdContext(clientInfo: unknown) {
  const user = await requireAccountingUser("ACCOUNTANT");
  const { company } = await getAccountingContext();
  if (!mtdVatAvailableFor(company.id)) throw new Error("Sending VAT returns to HMRC isn't available for this business yet.");
  if (!company.vat_registered || !company.vat_number) throw new Error("Add your VAT number in Business details first.");
  const fraud = await fraudPreventionHeaders({
    client: clientInfoSchema.parse(clientInfo), network: await requestNetwork(), userId: user.id, tenantId: company.id, multiFactor: await sessionMultiFactor(user.id),
  });
  return { user, company, vrn: company.vat_number, fraud };
}

export async function loadVatObligationsAction(clientInfo: unknown): Promise<Result<VatObligation[]>> {
  try {
    const { company, vrn, fraud } = await mtdContext(clientInfo);
    return { ok: true, data: await vatObligations(company.id, vrn, fraud) };
  } catch (error) { return fail(error); }
}

export async function previewVatReturnAction(start: string, end: string): Promise<Result<VatBoxes>> {
  try {
    await requireAccountingUser("ACCOUNTANT");
    return { ok: true, data: await getVatReturn(start, end) };
  } catch (error) { return fail(error); }
}

export async function submitVatReturnAction(input: { clientInfo: unknown; periodKey: string; declared: boolean }): Promise<Result<{ receipt: VatReceipt; boxes: VatBoxes }>> {
  try {
    if (!input.declared) throw new Error("Tick the declaration to confirm the return is true and complete.");
    const { user, company, vrn, fraud } = await mtdContext(input.clientInfo);
    // Re-read the obligation so the period dates come from HMRC, not the browser.
    const obligation = (await vatObligations(company.id, vrn, fraud)).find((item) => item.periodKey === input.periodKey && item.status === "O");
    if (!obligation) throw new Error("That VAT period is no longer open with HMRC.");
    const boxes = await getVatReturn(obligation.start, obligation.end);
    const receipt = await submitVatReturn(company.id, vrn, obligation.periodKey, boxes, fraud);
    const { error } = await createAdminClient().from("accounting_vat_returns").upsert({
      tenant_id: company.id, period_start: obligation.start, period_end: obligation.end, boxes, filed_by: user.id,
      filed_at: new Date().toISOString(), period_key: obligation.periodKey, submitted_at: receipt.processingDate,
      submission_environment: hmrcEnvironment(), hmrc_receipt: receipt,
    }, { onConflict: "tenant_id,period_start,period_end" });
    // HMRC has the return either way; tell the user to keep the receipt if saving failed.
    if (error) throw new Error(`HMRC accepted the return (form bundle ${receipt.formBundleNumber}), but ScorpBook couldn't save the receipt. Keep this number.`);
    revalidatePath("/reports/vat-return");
    return { ok: true, data: { receipt, boxes } };
  } catch (error) { return fail(error); }
}

export async function disconnectHmrcAction(): Promise<Result<null>> {
  try {
    await requireAccountingUser("OWNER");
    const { company } = await getAccountingContext();
    await disconnectHmrc(company.id);
    revalidatePath("/reports/vat-return");
    return { ok: true, data: null };
  } catch (error) { return fail(error); }
}

// Sandbox only: run HMRC's fraud prevention header checker on what we would send.
export async function checkFraudHeadersAction(clientInfo: unknown): Promise<Result<{ sent: Record<string, string>; result: unknown; requestHeaderNames: string[] }>> {
  try {
    if (hmrcEnvironment() !== "sandbox") throw new Error("The header checker is only available in the HMRC sandbox.");
    const { fraud } = await mtdContext(clientInfo);
    return { ok: true, data: { sent: fraud, result: await validateFraudHeaders(fraud), requestHeaderNames: await incomingHeaderNames() } };
  } catch (error) { return fail(error); }
}
