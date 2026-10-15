import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";

export const COMPANY_COOKIE = "scorpbook_company";
export const ROLES = ["VIEWER", "ACCOUNTANT", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

export type Company = {
  id: string;
  name: string;
  role: Role;
  business_type: "LIMITED_COMPANY" | "SOLE_TRADER";
  vat_registered: boolean;
  vat_number: string | null;
  year_end_month: number;
  year_end_day: number;
};
export type AccountingContext = { user: User; company: Company; companies: Company[] };
type PartialContext = { user: User; company: null; companies: []; needsSecondFactor?: boolean };

export class AccessError extends Error {}

// The signed-in user, the company they are working in (cookie-selected, else
// their first), and every company they belong to; null when signed out or not
// yet in any company. Cached per request.
export const getOptionalAccountingContext = cache(async (): Promise<AccountingContext | PartialContext | null> => {
  const supabase = await createSessionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  // Users with two-step verification must complete it before seeing any business.
  if (await needsSecondFactor(supabase)) return { user, company: null, companies: [], needsSecondFactor: true };

  const { data, error: membershipError } = await createAdminClient().from("accounting_memberships")
    .select("role, accounting_tenants (id, name, business_type, vat_registered, vat_number, year_end_month, year_end_day)")
    .eq("user_id", user.id);
  if (membershipError) throw new Error(`Failed to load your companies: ${membershipError.message}`);
  const companies = (data ?? []).flatMap((row) => row.accounting_tenants ? [{ ...row.accounting_tenants, role: row.role as Role } as Company] : [])
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!companies.length) return { user, company: null, companies: [] };

  const selectedId = (await cookies()).get(COMPANY_COOKIE)?.value;
  return { user, company: companies.find((item) => item.id === selectedId) ?? companies[0], companies };
});

// As above, but sends signed-out users to sign in and new users to company set-up.
export async function getAccountingContext(): Promise<AccountingContext> {
  const context = await getOptionalAccountingContext();
  if (!context) redirect("/login");
  if ("needsSecondFactor" in context && context.needsSecondFactor) redirect("/login/verify");
  if (!context.company) redirect("/onboarding");
  return context as AccountingContext;
}

export function hasRole(role: Role, minimum: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}

// Pages call this with the default (any member may look); actions that change
// the books require ACCOUNTANT, and team/company settings require OWNER.
export async function requireAccountingUser(minimum: Role = "VIEWER"): Promise<User> {
  const { user, company } = await getAccountingContext();
  if (!hasRole(company.role, minimum)) {
    throw new AccessError(minimum === "OWNER" ? "Only the company's Owner can do this." : "You have view-only access to this company.");
  }
  return user;
}

export async function currentTenantId(): Promise<string> {
  return (await getAccountingContext()).company.id;
}

// For pages outside the company context (onboarding, invitations): signed in, any memberships.
export async function requireSignedInUser(): Promise<User> {
  const supabase = await createSessionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  if (await needsSecondFactor(supabase)) redirect("/login/verify");
  return user;
}

// True when the user has a verified second factor but this session hasn't used it yet.
async function needsSecondFactor(supabase: Awaited<ReturnType<typeof createSessionClient>>): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(`Failed to check two-step verification: ${error.message}`);
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
