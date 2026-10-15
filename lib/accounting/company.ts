import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { ROLES, type Role } from "@/lib/accounting/auth";
import { isValidVatNumber, normaliseVatNumber } from "@/lib/accounting/vat-number";

export const companySchema = z.object({
  name: z.string().trim().min(1, "Enter your business name.").max(150),
  business_type: z.enum(["LIMITED_COMPANY", "SOLE_TRADER"]),
  vat_registered: z.boolean(),
  year_end_month: z.coerce.number().int().min(1).max(12),
  year_end_day: z.coerce.number().int().min(1).max(31),
  vat_number: z.string().max(20).optional().transform((value) => value ? normaliseVatNumber(value) : undefined)
    .refine((value) => !value || isValidVatNumber(value), "That VAT number doesn't look right. It should be 9 digits, like GB 123 4567 89."),
});

function fail(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(`${fallback}: ${error.message}`);
}

export async function createCompany(input: unknown, userId: string): Promise<string> {
  const company = companySchema.parse(input);
  const { data, error } = await createAdminClient().rpc("create_accounting_tenant", {
    p_user_id: userId, p_name: company.name, p_business_type: company.business_type,
    p_vat_registered: company.vat_registered, p_year_end_month: company.year_end_month, p_year_end_day: company.year_end_day,
  });
  fail(error, "Could not create the company");
  if (!data) throw new Error("Could not create the company.");
  if (company.vat_registered && company.vat_number) {
    const { error: vatError } = await createAdminClient().from("accounting_tenants").update({ vat_number: company.vat_number }).eq("id", data);
    fail(vatError, "Company created, but the VAT number could not be saved");
  }
  return data;
}

export async function updateCompany(tenantId: string, input: unknown): Promise<void> {
  const company = companySchema.omit({ business_type: true }).parse(input);
  const check = new Date(Date.UTC(2023, company.year_end_month - 1, company.year_end_day));
  if (check.getUTCDate() !== company.year_end_day) throw new Error("Choose a real year-end date.");
  const { error } = await createAdminClient().from("accounting_tenants")
    .update({ name: company.name, vat_registered: company.vat_registered, vat_number: company.vat_registered ? company.vat_number ?? null : null, year_end_month: company.year_end_month, year_end_day: company.year_end_day })
    .eq("id", tenantId);
  fail(error, "Could not save company details");
}

export type Member = { user_id: string; email: string; role: Role; created_at: string };
export type Invitation = { id: string; email: string; role: Role; created_at: string; expires_at: string };

export async function listMembers(tenantId: string): Promise<Member[]> {
  const client = createAdminClient();
  const { data, error } = await client.from("accounting_memberships").select("user_id, role, created_at").eq("tenant_id", tenantId).order("created_at");
  fail(error, "Could not load team");
  return Promise.all((data ?? []).map(async (member) => {
    const { data: found } = await client.auth.admin.getUserById(member.user_id);
    return { ...member, role: member.role as Role, email: found.user?.email ?? "Unknown user" };
  }));
}

export async function listPendingInvitations(tenantId: string): Promise<Invitation[]> {
  const { data, error } = await createAdminClient().from("accounting_invitations").select("id, email, role, created_at, expires_at")
    .eq("tenant_id", tenantId).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at");
  fail(error, "Could not load invitations");
  return (data ?? []).map((invite) => ({ ...invite, role: invite.role as Role }));
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Returns the secret token for the invitation link; only its hash is stored.
export async function createInvitation(tenantId: string, input: unknown, actorId: string): Promise<string> {
  const invite = z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")), role: z.enum(ROLES) }).parse(input);
  const token = randomBytes(24).toString("base64url");
  const { error } = await createAdminClient().from("accounting_invitations").insert({
    tenant_id: tenantId, email: invite.email, role: invite.role, token_hash: hashToken(token), invited_by: actorId,
  });
  fail(error, "Could not create the invitation");
  return token;
}

export async function revokeInvitation(tenantId: string, invitationId: string): Promise<void> {
  const { error } = await createAdminClient().from("accounting_invitations").update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("id", z.string().uuid().parse(invitationId)).is("accepted_at", null);
  fail(error, "Could not cancel the invitation");
}

export async function setMemberRole(tenantId: string, userId: string, role: Role | null): Promise<void> {
  const { error } = await createAdminClient().rpc("set_accounting_member_role", {
    p_tenant_id: tenantId, p_user_id: z.string().uuid().parse(userId), // NULL removes the member; the generated types don't model a nullable argument.
    p_role: role as unknown as string,
  });
  fail(error, "Could not update the team");
}

export type InvitationPreview = { company: string; role: Role; email: string; valid: boolean };

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const { data, error } = await createAdminClient().from("accounting_invitations")
    .select("email, role, expires_at, accepted_at, revoked_at, accounting_tenants (name)").eq("token_hash", hashToken(token)).maybeSingle();
  fail(error, "Could not load the invitation");
  if (!data) return null;
  return {
    company: data.accounting_tenants?.name ?? "a company",
    role: data.role as Role,
    email: data.email,
    valid: !data.accepted_at && !data.revoked_at && Date.parse(data.expires_at) > Date.now(),
  };
}

export async function acceptInvitation(token: string, userId: string, email: string): Promise<string> {
  const { data, error } = await createAdminClient().rpc("accept_accounting_invitation", { p_token_hash: hashToken(token), p_user_id: userId, p_email: email });
  fail(error, "Could not accept the invitation");
  if (!data) throw new Error("Could not accept the invitation.");
  return data;
}
