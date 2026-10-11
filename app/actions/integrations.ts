"use server";

import { revalidatePath } from "next/cache";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { retryScorpInvoiceEvent } from "@/lib/integrations/scorpinvoice";
import type { ActionResult } from "@/app/actions/accounting";

export async function retryScorpInvoiceEventAction(formData: FormData): Promise<ActionResult> {
  await requireAccountingUser();
  try {
    const result = await retryScorpInvoiceEvent(String(formData.get("id") || ""));
    revalidatePath("/integrations/scorpinvoice");
    revalidatePath("/dashboard");
    revalidatePath("/journal");
    if (result.status === "NEEDS_ATTENTION") return { ok: false, message: result.error ?? "It still couldn't be recorded." };
    return { ok: true, message: result.status === "STALE" ? "A newer update has already been recorded." : "Recorded." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Retry failed. Please try again." };
  }
}
