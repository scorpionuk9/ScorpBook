import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountingContext, hasRole } from "@/lib/accounting/auth";
import { connectHmrc } from "@/lib/hmrc/oauth";
import { HMRC_STATE_COOKIE } from "@/lib/hmrc/config";

// HMRC sends the user back here with ?code&state (or ?error when they decline).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (status: string) => NextResponse.redirect(new URL(`/reports/vat-return?hmrc=${status}`, url.origin));
  const store = await cookies();
  const saved = store.get(HMRC_STATE_COOKIE)?.value ?? "";
  store.delete({ name: HMRC_STATE_COOKIE, path: "/integrations/hmrc" });
  const [state, tenantId] = saved.split(".");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("declined");
  if (!code || !state || state !== url.searchParams.get("state")) return back("error");

  const { user, company } = await getAccountingContext();
  // The business must not have changed while the user was at HMRC.
  if (company.id !== tenantId || !hasRole(company.role, "ACCOUNTANT")) return back("error");
  try {
    await connectHmrc(company.id, code, url.origin, user.id);
  } catch {
    return back("error");
  }
  return back("connected");
}
