"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { COMPANY_COOKIE, getAccountingContext, requireAccountingUser, requireSignedInUser, ROLES, type Role } from "@/lib/accounting/auth";
import { acceptInvitation, createCompany, createInvitation, revokeInvitation, setMemberRole, updateCompany } from "@/lib/accounting/company";
import type { ActionResult } from "@/app/actions/accounting";

function failure(error: unknown): ActionResult {
  return { ok: false, message: error instanceof Error ? error.message.replace(/^Could not [^:]+: /, "") : "Something went wrong. Please try again." };
}

async function selectCompany(tenantId: string) {
  (await cookies()).set(COMPANY_COOKIE, tenantId, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production",
  });
}

function companyFields(formData: FormData) {
  return {
    name: String(formData.get("name") || ""),
    business_type: String(formData.get("business_type") || ""),
    vat_registered: formData.get("vat_registered") === "on",
    vat_number: String(formData.get("vat_number") || ""),
    year_end_month: String(formData.get("year_end_month") || ""),
    year_end_day: String(formData.get("year_end_day") || ""),
  };
}

export async function createCompanyAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireSignedInUser();
    const id = await createCompany(companyFields(formData), user.id);
    await selectCompany(id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Company created.", id };
  } catch (error) { return failure(error); }
}

export async function switchCompanyAction(formData: FormData): Promise<void> {
  const { companies } = await getAccountingContext();
  const id = String(formData.get("company_id") || "");
  if (!companies.some((company) => company.id === id)) return;
  await selectCompany(id);
  revalidatePath("/", "layout");
}

export async function updateCompanyAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAccountingUser("OWNER");
    const { company } = await getAccountingContext();
    await updateCompany(company.id, companyFields(formData));
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (error) { return failure(error); }
}

async function appOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "scorpbook.scorpiatech.com";
  const protocol = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function inviteMemberAction(formData: FormData): Promise<ActionResult & { link?: string }> {
  try {
    const user = await requireAccountingUser("OWNER");
    const { company } = await getAccountingContext();
    const token = await createInvitation(company.id, { email: String(formData.get("email") || ""), role: String(formData.get("role") || "") }, user.id);
    revalidatePath("/settings/team");
    return { ok: true, message: "Invitation created.", link: `${await appOrigin()}/invite/${token}` };
  } catch (error) { return failure(error); }
}

export async function revokeInvitationAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAccountingUser("OWNER");
    const { company } = await getAccountingContext();
    await revokeInvitation(company.id, String(formData.get("invitation_id") || ""));
    revalidatePath("/settings/team");
    return { ok: true, message: "Invitation cancelled." };
  } catch (error) { return failure(error); }
}

export async function setMemberRoleAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAccountingUser("OWNER");
    const { company } = await getAccountingContext();
    const role = String(formData.get("role") || "");
    await setMemberRole(company.id, String(formData.get("user_id") || ""), role === "REMOVE" ? null : (ROLES.find((item) => item === role) as Role));
    revalidatePath("/settings/team");
    return { ok: true, message: "Team updated." };
  } catch (error) { return failure(error); }
}

export async function acceptInvitationAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireSignedInUser();
    const tenantId = await acceptInvitation(String(formData.get("token") || ""), user.id, user.email ?? "");
    await selectCompany(tenantId);
    revalidatePath("/", "layout");
    return { ok: true, message: "You've joined.", id: tenantId };
  } catch (error) { return failure(error); }
}
