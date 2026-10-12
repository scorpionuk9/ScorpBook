import { NextResponse } from "next/server";
import type { Json } from "@/types/supabase";
import { isLinkedScorpInvoiceUser, receiveScorpInvoiceEvent, scorpInvoiceEventSchema, verifyScorpInvoiceSignature } from "@/lib/integrations/scorpinvoice";

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
  // Only ScorpInvoice accounts a company has connected may post into it.
  if (!(await isLinkedScorpInvoiceUser(parsed.tenant_id, parsed.source_user_id))) {
    return NextResponse.json({ error: "This ScorpInvoice account is not connected to that company" }, { status: 403 });
  }

  const result = await receiveScorpInvoiceEvent(parsed.tenant_id, parsed.event_id, parsed.snapshot as unknown as Json);
  return NextResponse.json(result);
}
