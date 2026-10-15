import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountingContext, hasRole } from "@/lib/accounting/auth";
import { HMRC_STATE_COOKIE, mtdVatAvailableFor } from "@/lib/hmrc/config";
import { hmrcAuthorizeUrl } from "@/lib/hmrc/oauth";

// Starts HMRC's OAuth sign-in for the current business. The state cookie ties
// the callback to this browser and business.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { company } = await getAccountingContext();
  if (!hasRole(company.role, "ACCOUNTANT") || !mtdVatAvailableFor(company.id)) {
    return NextResponse.redirect(new URL("/reports/vat-return?hmrc=unavailable", origin));
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(HMRC_STATE_COOKIE, `${state}.${company.id}`, {
    path: "/integrations/hmrc", maxAge: 600, httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"),
  });
  return NextResponse.redirect(hmrcAuthorizeUrl(state, origin));
}
