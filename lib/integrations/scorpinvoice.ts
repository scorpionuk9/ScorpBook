import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/server";
import { SCORPBOOK_TENANT_ID } from "@/lib/accounting/constants";

// Deliveries older than this are rejected so a captured request can't be replayed later.
const SIGNATURE_TOLERANCE_SECONDS = 300;

export const scorpInvoiceEventSchema = z.object({
  event_id: z.string().min(1).max(100),
  tenant_id: z.string().uuid(),
  snapshot: z.object({
    type: z.enum(["invoice", "expense"]),
    id: z.string().uuid(),
    snapshot_at: z.string().min(1),
  }).passthrough(),
});

// Signature header format: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>".
export function verifyScorpInvoiceSignature(body: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const received = Buffer.from(parts.v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export type ScorpInvoiceEventResult = { status: "PROCESSED" | "STALE" | "NEEDS_ATTENTION" | "DUPLICATE"; error?: string | null };

export async function receiveScorpInvoiceEvent(eventId: string, snapshot: Json): Promise<ScorpInvoiceEventResult> {
  const { data, error } = await createAdminClient().rpc("receive_scorpinvoice_event", {
    p_tenant_id: SCORPBOOK_TENANT_ID, p_event_id: eventId, p_snapshot: snapshot,
  });
  if (error) throw new Error(`Failed to record ScorpInvoice event: ${error.message}`);
  return z.object({ status: z.enum(["PROCESSED", "STALE", "NEEDS_ATTENTION", "DUPLICATE"]), error: z.string().nullish() }).parse(data);
}

export type ScorpInvoiceEvent = { id: string; event_id: string; status: string; error: string | null; attempts: number; processed_at: string; updated_at: string; payload: Json };

export async function listScorpInvoiceEvents(limit = 50): Promise<ScorpInvoiceEvent[]> {
  const { data, error } = await createAdminClient().from("webhook_events")
    .select("id, event_id, status, error, attempts, processed_at, updated_at, payload")
    .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("source_system", "SCORPINVOICE")
    .order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to load ScorpInvoice events: ${error.message}`);
  return data ?? [];
}

export async function retryScorpInvoiceEvent(id: string): Promise<ScorpInvoiceEventResult> {
  const { data, error } = await createAdminClient().from("webhook_events").select("event_id, payload, status")
    .eq("tenant_id", SCORPBOOK_TENANT_ID).eq("source_system", "SCORPINVOICE").eq("id", z.string().uuid().parse(id)).maybeSingle();
  if (error) throw new Error(`Failed to load ScorpInvoice event: ${error.message}`);
  if (!data) throw new Error("That ScorpInvoice update could not be found.");
  if (data.status !== "NEEDS_ATTENTION") throw new Error("Only updates that need attention can be retried.");
  return receiveScorpInvoiceEvent(data.event_id, data.payload);
}
