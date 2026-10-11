"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { parseViewMode, VIEW_MODE_COOKIE } from "@/lib/ui/view-mode";

export async function setViewModeAction(formData: FormData): Promise<void> {
  await requireAccountingUser();
  const mode = parseViewMode(String(formData.get("mode") || ""));
  (await cookies()).set(VIEW_MODE_COOKIE, mode, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
