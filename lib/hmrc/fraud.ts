import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { HMRC_PRODUCT_NAME, HMRC_PRODUCT_VERSION } from "@/lib/hmrc/config";

// HMRC fraud prevention headers for the WEB_APP_VIA_SERVER connection method.
// Browser-only values arrive from components/hmrc/client-info.ts; network values
// come from the incoming request. Required by law on every MTD API call.

export const clientInfoSchema = z.object({
  userAgent: z.string().max(1000),
  deviceId: z.string().uuid(),
  screens: z.array(z.object({ width: z.number(), height: z.number(), scalingFactor: z.number(), colourDepth: z.number() })).min(1).max(8),
  windowSize: z.object({ width: z.number(), height: z.number() }),
  timezone: z.string().regex(/^UTC[+-]\d{2}:\d{2}$/),
});
export type ClientInfo = z.infer<typeof clientInfoSchema>;

export type RequestNetwork = { clientIp: string | null; clientPort: string | null; receivedAt: Date };
export type MultiFactor = { type: "TOTP"; at: Date; reference: string } | null;

const encode = (value: string | number) => encodeURIComponent(String(value));
const pairs = (entries: Array<[string, string | number]>) => entries.map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&");

function isPublicIp(ip: string): boolean {
  if (/^(10\.|127\.|192\.168\.|169\.254\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip)) return false;
  return true;
}

// The server's own public IP as HMRC sees it; looked up once per isolate.
let vendorIpPromise: Promise<string | null> | null = null;
export function vendorPublicIp(): Promise<string | null> {
  vendorIpPromise ??= fetch("https://api.ipify.org", { signal: AbortSignal.timeout(5000) })
    .then((response) => (response.ok ? response.text() : null))
    .then((ip) => (ip && isPublicIp(ip.trim()) ? ip.trim() : null))
    .catch(() => { vendorIpPromise = null; return null; });
  return vendorIpPromise;
}

export function multiFactorReference(userId: string): string {
  return createHash("sha256").update(`scorpbook-totp:${userId}`).digest("hex");
}

// ScorpBook has no installed licence keys; the business's ScorpBook account is
// its licence, sent hashed.
export function licenceId(tenantId: string): string {
  return createHash("sha256").update(`scorpbook-licence:${tenantId}`).digest("hex");
}

export async function fraudPreventionHeaders(input: { client: ClientInfo; network: RequestNetwork; userId: string; tenantId: string; multiFactor: MultiFactor }): Promise<Record<string, string>> {
  const { client, network, userId, tenantId, multiFactor } = input;
  const vendorIp = await vendorPublicIp();
  const clientIp = network.clientIp && isPublicIp(network.clientIp) ? network.clientIp : null;
  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": client.userAgent,
    "Gov-Client-Device-ID": client.deviceId,
    "Gov-Client-Screens": client.screens.map((screen) => pairs([["width", screen.width], ["height", screen.height], ["scaling-factor", screen.scalingFactor], ["colour-depth", screen.colourDepth]])).join(","),
    "Gov-Client-Window-Size": pairs([["width", client.windowSize.width], ["height", client.windowSize.height]]),
    "Gov-Client-Timezone": client.timezone,
    "Gov-Client-User-IDs": pairs([["scorpbook", userId]]),
    "Gov-Vendor-Product-Name": encode(HMRC_PRODUCT_NAME),
    "Gov-Vendor-Version": pairs([[HMRC_PRODUCT_NAME, HMRC_PRODUCT_VERSION]]),
    "Gov-Vendor-License-IDs": pairs([[HMRC_PRODUCT_NAME, licenceId(tenantId)]]),
  };
  if (clientIp) {
    headers["Gov-Client-Public-IP"] = clientIp;
    headers["Gov-Client-Public-IP-Timestamp"] = network.receivedAt.toISOString();
    if (network.clientPort) headers["Gov-Client-Public-Port"] = network.clientPort;
  }
  if (vendorIp) {
    headers["Gov-Vendor-Public-IP"] = vendorIp;
    if (clientIp) headers["Gov-Vendor-Forwarded"] = pairs([["by", vendorIp], ["for", clientIp]]);
  }
  if (multiFactor) {
    headers["Gov-Client-Multi-Factor"] = pairs([["type", multiFactor.type], ["timestamp", `${multiFactor.at.toISOString().slice(0, 16)}Z`], ["unique-reference", multiFactor.reference]]);
  }
  return headers;
}
