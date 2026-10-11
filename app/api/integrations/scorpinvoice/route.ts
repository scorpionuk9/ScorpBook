import { NextResponse } from "next/server";
import type { Json } from "@/types/supabase";
import { SCORPBOOK_TENANT_ID } from "@/lib/accounting/constants";
import { receiveScorpInvoiceEvent, scorpInvoiceEventSchema, verifyScorpInvoiceSignature } from "@/lib/integrations/scorpinvoice";

// Receives signed invoice/expense snapshots from ScorpInvoice. Any 2xx tells
// ScorpInvoice to stop retrying: snapshots that fail to post are kept here as
// NEEDS_ATTENTION and retried from the ScorpInvoice sync page instead.
export async function POST(request: Request) {
  const secret = process.env.SCORPINVOICE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "ScorpInvoice sync is not configured" }, { status: 503 });

  const body = await request.text();
  if (!verifyScorpInvoiceSignature(body, request.headers.get("x-scorpbook-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = scorpInvoiceEventSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (parsed.tenant_id !== SCORPBOOK_TENANT_ID) {
    return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
  }

  const result = await receiveScorpInvoiceEvent(parsed.event_id, parsed.snapshot as unknown as Json);
  return NextResponse.json(result);
}
