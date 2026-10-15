import "server-only";

import { headers } from "next/headers";
import { createSessionClient } from "@/lib/supabase/server";
import { multiFactorReference, type MultiFactor, type RequestNetwork } from "@/lib/hmrc/fraud";

// Network details of the user's request, as seen at the edge (Cloudflare) or
// via standard proxy headers locally.
export async function requestNetwork(): Promise<RequestNetwork> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    clientIp: list.get("cf-connecting-ip") ?? forwarded ?? list.get("x-real-ip") ?? null,
    clientPort: list.get("cf-connecting-port") ?? list.get("x-client-port") ?? null,
    receivedAt: new Date(),
  };
}

// Names (not values) of incoming request headers, for diagnosing which network
// details the edge passes on. Sandbox use only.
export async function incomingHeaderNames(): Promise<string[]> {
  return [...(await headers()).keys()].sort();
}

// The authenticator-app step of this session, if the user completed one.
export async function sessionMultiFactor(userId: string): Promise<MultiFactor> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // Entries can be plain method names in some session formats; only full entries carry a timestamp.
  const totp = data?.currentAuthenticationMethods?.find((entry) => typeof entry !== "string" && entry.method === "totp");
  return totp && typeof totp !== "string" ? { type: "TOTP", at: new Date(totp.timestamp * 1000), reference: multiFactorReference(userId) } : null;
}
