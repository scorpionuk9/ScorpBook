import "server-only";

// HMRC Developer Hub application "ScorpBook". HMRC_ENV selects sandbox
// (test-api) or production; the credentials must belong to that environment.
export type HmrcEnvironment = "sandbox" | "production";

export const HMRC_PRODUCT_NAME = "ScorpBook";
export const HMRC_PRODUCT_VERSION = "0.1.0";
export const HMRC_SCOPES = "read:vat write:vat";

export function hmrcEnvironment(): HmrcEnvironment {
  return process.env.HMRC_ENV === "production" ? "production" : "sandbox";
}

export function hmrcApiBase(): string {
  return hmrcEnvironment() === "production" ? "https://api.service.hmrc.gov.uk" : "https://test-api.service.hmrc.gov.uk";
}

export function hmrcCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("HMRC isn't set up on this server.");
  return { clientId, clientSecret };
}

// MTD VAT is offered when credentials are configured. HMRC_ENABLED_TENANTS (comma
// separated) limits it to named businesses, e.g. while production runs against
// the sandbox during HMRC's approval.
export function mtdVatAvailableFor(tenantId: string): boolean {
  if (!process.env.HMRC_CLIENT_ID || !process.env.HMRC_CLIENT_SECRET || !process.env.HMRC_TOKEN_KEY) return false;
  const allowed = (process.env.HMRC_ENABLED_TENANTS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return !allowed.length || allowed.includes(tenantId);
}

// Ties the HMRC OAuth callback to the browser and business that started it.
export const HMRC_STATE_COOKIE = "scorpbook_hmrc_state";

export function hmrcRedirectUri(origin: string): string {
  return `${origin}/integrations/hmrc/callback`;
}
