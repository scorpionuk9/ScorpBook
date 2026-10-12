import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";

// Deliveries older than this are rejected so a captured request can't be replayed later.
const SIGNATURE_TOLERANCE_SECONDS = 300;
const SCORPINVOICE_URL = process.env.SCORPINVOICE_URL ?? "https://scorpinvoice.scorpiatech.com";

function secret(): string {
  const value = process.env.SCORPINVOICE_WEBHOOK_SECRET;
  if (!value) throw new Error("ScorpInvoice sync is not configured on this server.");
  return value;
}

export function scorpInvoiceSyncConfigured(): boolean {
  return Boolean(process.env.SCORPINVOICE_WEBHOOK_SECRET);
}

export const scorpInvoiceEventSchema = z.object({
  event_id: z.string().min(1).max(100),
  tenant_id: z.string().uuid(),
  source_user_id: z.string().uuid(),
  snapshot: z.object({
    type: z.enum(["invoice", "expense"]),
    id: z.string().uuid(),
    snapshot_at: z.string().min(1),
  }).passthrough(),
});

function sameHex(received: string, expected: Buffer): boolean {
  const buffer = Buffer.from(received, "hex");
  return buffer.length === expected.length && timingSafeEqual(buffer, expected);
}

// Signature header format: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>".
export function verifyScorpInvoiceSignature(body: string, header: string | null, key: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS || !parts.v1) return false;
  return sameHex(parts.v1, createHmac("sha256", key).update(`${timestamp}.${body}`).digest());
}

function signatureHeader(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${createHmac("sha256", secret()).update(`${timestamp}.${body}`).digest("hex")}`;
}

// Hand-off token ScorpInvoice puts in the "Connect to ScorpBook" link:
// base64url(JSON) + "." + hex HMAC-SHA256 of "connect.<payload>", valid for 30 minutes.
export type ConnectRequest = { user_id: string; email: string; business_name: string };
const connectPayloadSchema = z.object({ u: z.string().uuid(), e: z.string().email(), n: z.string().max(200), exp: z.number().int() });

export function readConnectToken(token: string): ConnectRequest | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !scorpInvoiceSyncConfigured()) return null;
  if (!sameHex(signature, createHmac("sha256", secret()).update(`connect.${payload}`).digest())) return null;
  try {
    const data = connectPayloadSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (data.exp * 1000 < Date.now()) return null;
    return { user_id: data.u, email: data.e, business_name: data.n };
  } catch {
    return null;
  }
}

// Tells ScorpInvoice to start (or stop) sending a user's records to a company.
export async function setScorpInvoiceConnection(input: { user_id: string; tenant_id: string; enabled: boolean; backfill: boolean }): Promise<{ queued: number }> {
  const body = JSON.stringify(input);
  const response = await fetch(`${SCORPINVOICE_URL}/api/scorpbook/connect`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scorpbook-signature": signatureHeader(body) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ScorpInvoice could not update the connection${result?.error ? `: ${result.error}` : "."}`);
  return { queued: Number(result?.queued ?? 0) };
}

export async function isLinkedScorpInvoiceUser(tenantId: string, scorpInvoiceUserId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("scorpinvoice_links").select("tenant_id")
    .eq("tenant_id", tenantId).eq("scorpinvoice_user_id", scorpInvoiceUserId).maybeSingle();
  if (error) throw new Error(`Failed to check ScorpInvoice link: ${error.message}`);
  return Boolean(data);
}

export type ScorpInvoiceLink = { scorpinvoice_user_id: string; scorpinvoice_email: string | null; created_at: string };

export async function listScorpInvoiceLinks(tenantId: string): Promise<ScorpInvoiceLink[]> {
  const { data, error } = await createAdminClient().from("scorpinvoice_links").select("scorpinvoice_user_id, scorpinvoice_email, created_at").eq("tenant_id", tenantId);
  if (error) throw new Error(`Failed to load ScorpInvoice links: ${error.message}`);
  return data ?? [];
}

export async function linkScorpInvoiceAccount(tenantId: string, request: ConnectRequest, actorId: string, backfill: boolean): Promise<number> {
  const client = createAdminClient();
  const { data: existing, error } = await client.from("scorpinvoice_links").select("tenant_id").eq("scorpinvoice_user_id", request.user_id).maybeSingle();
  if (error) throw new Error(`Failed to check ScorpInvoice link: ${error.message}`);
  if (existing && existing.tenant_id !== tenantId) throw new Error("This ScorpInvoice account is already connected to another company. Disconnect it there first.");
  if (!existing) {
    const { error: insertError } = await client.from("scorpinvoice_links").insert({ tenant_id: tenantId, scorpinvoice_user_id: request.user_id, scorpinvoice_email: request.email, linked_by: actorId });
    if (insertError) throw new Error(`Failed to link ScorpInvoice account: ${insertError.message}`);
  }
  try {
    return (await setScorpInvoiceConnection({ user_id: request.user_id, tenant_id: tenantId, enabled: true, backfill })).queued;
  } catch (failure) {
    if (!existing) await client.from("scorpinvoice_links").delete().eq("tenant_id", tenantId).eq("scorpinvoice_user_id", request.user_id);
    throw failure;
  }
}

export async function unlinkScorpInvoiceAccount(tenantId: string, scorpInvoiceUserId: string): Promise<void> {
  await setScorpInvoiceConnection({ user_id: scorpInvoiceUserId, tenant_id: tenantId, enabled: false, backfill: false });
  const { error } = await createAdminClient().from("scorpinvoice_links").delete().eq("tenant_id", tenantId).eq("scorpinvoice_user_id", scorpInvoiceUserId);
  if (error) throw new Error(`Failed to remove ScorpInvoice link: ${error.message}`);
}

export type ScorpInvoiceEventResult = { status: "PROCESSED" | "STALE" | "NEEDS_ATTENTION" | "DUPLICATE"; error?: string | null };

export async function receiveScorpInvoiceEvent(tenantId: string, eventId: string, snapshot: Json): Promise<ScorpInvoiceEventResult> {
  const { data, error } = await createAdminClient().rpc("receive_scorpinvoice_event", {
    p_tenant_id: tenantId, p_event_id: eventId, p_snapshot: snapshot,
  });
  if (error) throw new Error(`Failed to record ScorpInvoice event: ${error.message}`);
  return z.object({ status: z.enum(["PROCESSED", "STALE", "NEEDS_ATTENTION", "DUPLICATE"]), error: z.string().nullish() }).parse(data);
}

export type ScorpInvoiceEvent = { id: string; event_id: string; status: string; error: string | null; attempts: number; processed_at: string; updated_at: string; payload: Json };

export async function listScorpInvoiceEvents(tenantId: string, limit = 50): Promise<ScorpInvoiceEvent[]> {
  const { data, error } = await createAdminClient().from("webhook_events")
    .select("id, event_id, status, error, attempts, processed_at, updated_at, payload")
    .eq("tenant_id", tenantId).eq("source_system", "SCORPINVOICE")
    .order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to load ScorpInvoice events: ${error.message}`);
  return data ?? [];
}

export async function retryScorpInvoiceEvent(tenantId: string, id: string): Promise<ScorpInvoiceEventResult> {
  const { data, error } = await createAdminClient().from("webhook_events").select("event_id, payload, status")
    .eq("tenant_id", tenantId).eq("source_system", "SCORPINVOICE").eq("id", z.string().uuid().parse(id)).maybeSingle();
  if (error) throw new Error(`Failed to load ScorpInvoice event: ${error.message}`);
  if (!data) throw new Error("That ScorpInvoice update could not be found.");
  if (data.status !== "NEEDS_ATTENTION") throw new Error("Only updates that need attention can be retried.");
  return receiveScorpInvoiceEvent(tenantId, data.event_id, data.payload);
}
