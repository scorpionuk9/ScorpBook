import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/journal";
  let next = "/journal";
  try {
    const candidate = new URL(requestedNext, url.origin);
    if (candidate.origin === url.origin) next = `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    // Ignore invalid redirect targets and keep the default destination.
  }

  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?confirmation=failed", url.origin));
}
