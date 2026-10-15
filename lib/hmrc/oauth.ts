import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/hmrc/crypto";
import { HMRC_SCOPES, hmrcApiBase, hmrcCredentials, hmrcEnvironment, hmrcRedirectUri, type HmrcEnvironment } from "@/lib/hmrc/config";

// User-restricted OAuth 2.0 (authorisation code) for HMRC. Access tokens last
// 4 hours and are refreshed automatically; refresh tokens last 18 months, after
// which the business has to connect again.

const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number(), scope: z.string().optional() });

export function hmrcAuthorizeUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    response_type: "code", client_id: hmrcCredentials().clientId, scope: HMRC_SCOPES, state, redirect_uri: hmrcRedirectUri(origin),
  });
  return `${hmrcApiBase()}/oauth/authorize?${params}`;
}

async function tokenResponse(body: Record<string, string>): Promise<unknown> {
  const { clientId, clientSecret } = hmrcCredentials();
  const response = await fetch(`${hmrcApiBase()}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HMRC sign-in failed (${response.status}${json?.error ? `: ${json.error}` : ""}).`);
  return json;
}

async function tokenRequest(body: Record<string, string>) {
  return tokenSchema.parse(await tokenResponse(body));
}

async function saveTokens(tenantId: string, tokens: z.infer<typeof tokenSchema>, connectedBy?: string): Promise<string> {
  const row = {
    environment: hmrcEnvironment(),
    access_token: encryptSecret(tokens.access_token),
    refresh_token: encryptSecret(tokens.refresh_token),
    access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? HMRC_SCOPES,
    updated_at: new Date().toISOString(),
  };
  const client = createAdminClient();
  const { error } = connectedBy
    ? await client.from("accounting_hmrc_connections").upsert({ tenant_id: tenantId, connected_by: connectedBy, connected_at: new Date().toISOString(), ...row })
    : await client.from("accounting_hmrc_connections").update(row).eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not save the HMRC connection: ${error.message}`);
  return tokens.access_token;
}

export async function connectHmrc(tenantId: string, code: string, origin: string, userId: string): Promise<void> {
  await saveTokens(tenantId, await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: hmrcRedirectUri(origin) }), userId);
}

export type HmrcConnection = { environment: HmrcEnvironment; connected_at: string };

export async function getHmrcConnection(tenantId: string): Promise<HmrcConnection | null> {
  const { data, error } = await createAdminClient().from("accounting_hmrc_connections").select("environment, connected_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`Could not load the HMRC connection: ${error.message}`);
  // A connection made against the other HMRC environment is useless here.
  return data && data.environment === hmrcEnvironment() ? (data as HmrcConnection) : null;
}

export class HmrcReconnectError extends Error {}

// A valid access token for the business, refreshing it when it is about to expire.
export async function hmrcAccessToken(tenantId: string): Promise<string> {
  const { data, error } = await createAdminClient().from("accounting_hmrc_connections")
    .select("environment, access_token, refresh_token, access_expires_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`Could not load the HMRC connection: ${error.message}`);
  if (!data || data.environment !== hmrcEnvironment()) throw new HmrcReconnectError("Connect to HMRC first.");
  if (Date.parse(data.access_expires_at) - Date.now() > 60_000) return decryptSecret(data.access_token);
  try {
    return await saveTokens(tenantId, await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(data.refresh_token) }));
  } catch {
    throw new HmrcReconnectError("Your HMRC connection has expired. Connect to HMRC again.");
  }
}

export async function disconnectHmrc(tenantId: string): Promise<void> {
  const { error } = await createAdminClient().from("accounting_hmrc_connections").delete().eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not disconnect HMRC: ${error.message}`);
}

// Application-restricted token, for sandbox test support APIs.
export async function hmrcApplicationToken(): Promise<string> {
  // Client-credentials tokens have no refresh token.
  return z.object({ access_token: z.string() }).parse(await tokenResponse({ grant_type: "client_credentials" })).access_token;
}
