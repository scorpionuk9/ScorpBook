import "server-only";

import Decimal from "decimal.js";
import { z } from "zod";
import { hmrcApiBase } from "@/lib/hmrc/config";
import { hmrcAccessToken, hmrcApplicationToken } from "@/lib/hmrc/oauth";
import type { VatBoxes } from "@/lib/accounting/service";

const ACCEPT = "application/vnd.hmrc.1.0+json";

export class HmrcApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

async function hmrcFetch(path: string, init: { method?: string; token: string; fraud: Record<string, string>; body?: unknown }) {
  const response = await fetch(`${hmrcApiBase()}${path}`, {
    method: init.method ?? "GET",
    headers: { Accept: ACCEPT, Authorization: `Bearer ${init.token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.fraud },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    // Business errors arrive as { code: "BUSINESS_ERROR", errors: [{ code: "DUPLICATE_SUBMISSION", ... }] }.
    const inner = json?.errors?.[0]?.code;
    const code = json?.code && json.code !== "BUSINESS_ERROR" && json.code !== "INVALID_REQUEST" ? json.code : inner ?? json?.code;
    console.error(`[hmrc] ${init.method ?? "GET"} ${path.replace(/\/\d{9}\//, "/<vrn>/")} → ${response.status} ${text.slice(0, 500)}`);
    throw new HmrcApiError(friendlyError(response.status, code, json?.errors?.[0]?.message ?? json?.message), response.status, code);
  }
  return { json, headers: response.headers };
}

function friendlyError(status: number, code: string | undefined, message: string | undefined): string {
  switch (code) {
    case "DUPLICATE_SUBMISSION": return "HMRC already has a VAT return for this period.";
    case "TAX_PERIOD_NOT_ENDED": return "This VAT period hasn't ended yet, so it can't be submitted.";
    case "VRN_INVALID": case "INVALID_VRN": return "HMRC doesn't recognise this VAT number. Check it in Business details.";
    case "CLIENT_OR_AGENT_NOT_AUTHORISED": return "The HMRC account you connected can't act for this VAT number. Connect with the business's own HMRC sign-in.";
    case "INSOLVENT_TRADER": return "HMRC records show this business as insolvent, so returns can't be filed online.";
    case "NOT_FOUND": return "HMRC has no VAT periods for this business yet.";
  }
  if (status === 401) return "HMRC refused the request. Please connect to HMRC again.";
  if (status === 403) return `HMRC refused the request${code ? ` (${code})` : ""}${message ? `: ${message}` : ""}.`;
  if (status === 429) return "HMRC is busy. Please wait a minute and try again.";
  return `HMRC returned an error (${status}${code ? ` ${code}` : ""})${message ? `: ${message}` : ""}.`;
}

export type VatObligation = { periodKey: string; start: string; end: string; due: string; status: "O" | "F"; received?: string };
const obligationsSchema = z.object({ obligations: z.array(z.object({
  periodKey: z.string(), start: z.string(), end: z.string(), due: z.string(), status: z.enum(["O", "F"]), received: z.string().optional(),
})) });

// Open obligations, plus any fulfilled in the last year for context.
export async function vatObligations(tenantId: string, vrn: string, fraud: Record<string, string>): Promise<VatObligation[]> {
  const token = await hmrcAccessToken(tenantId);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  try {
    const { json } = await hmrcFetch(`/organisations/vat/${vrn}/obligations?from=${from}&to=${to}`, { token, fraud });
    return obligationsSchema.parse(json).obligations.sort((a, b) => a.start.localeCompare(b.start));
  } catch (error) {
    if (error instanceof HmrcApiError && error.status === 404) return [];
    throw error;
  }
}

export type VatReceipt = { processingDate: string; formBundleNumber: string; paymentIndicator?: string; chargeRefNumber?: string; receiptId?: string; correlationId?: string };

// Box values come from get_vat_return: boxes 1-5 to the penny, 6-9 whole pounds.
export function vatReturnBody(periodKey: string, boxes: VatBoxes) {
  const pence = (value: string) => Number(new Decimal(value).toFixed(2));
  const pounds = (value: string) => Number(new Decimal(value).toFixed(0));
  return {
    periodKey,
    vatDueSales: pence(boxes.box1),
    vatDueAcquisitions: pence(boxes.box2),
    totalVatDue: pence(boxes.box3),
    vatReclaimedCurrPeriod: pence(boxes.box4),
    netVatDue: pence(new Decimal(boxes.box5).abs().toFixed(2)),
    totalValueSalesExVAT: pounds(boxes.box6),
    totalValuePurchasesExVAT: pounds(boxes.box7),
    totalValueGoodsSuppliedExVAT: pounds(boxes.box8),
    totalAcquisitionsExVAT: pounds(boxes.box9),
    finalised: true,
  };
}

export async function submitVatReturn(tenantId: string, vrn: string, periodKey: string, boxes: VatBoxes, fraud: Record<string, string>): Promise<VatReceipt> {
  const token = await hmrcAccessToken(tenantId);
  const { json, headers } = await hmrcFetch(`/organisations/vat/${vrn}/returns`, { method: "POST", token, fraud, body: vatReturnBody(periodKey, boxes) });
  return {
    processingDate: json.processingDate, formBundleNumber: json.formBundleNumber,
    paymentIndicator: json.paymentIndicator, chargeRefNumber: json.chargeRefNumber,
    receiptId: headers.get("Receipt-ID") ?? undefined, correlationId: headers.get("X-CorrelationId") ?? undefined,
  };
}

// Sandbox only: HMRC's checker for fraud prevention headers.
export async function validateFraudHeaders(fraud: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${hmrcApiBase()}/test/fraud-prevention-headers/validate`, {
    headers: { Accept: ACCEPT, Authorization: `Bearer ${await hmrcApplicationToken()}`, ...fraud },
    signal: AbortSignal.timeout(15_000),
  });
  return response.json().catch(() => ({ status: response.status }));
}
