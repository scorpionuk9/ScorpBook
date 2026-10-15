import { getAccountingContext } from "@/lib/accounting/auth";
import { CompanyForm } from "@/components/company/company-form";
import { formatVatNumber } from "@/lib/accounting/vat-number";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const { company } = await getAccountingContext();
  return <main className="mx-auto w-full max-w-2xl px-5 py-8"><div className="space-y-6">
    <div><p className="text-sm font-semibold text-accent">SETUP</p><h1 className="mt-1 text-3xl font-bold">Business details</h1>
      {company.role !== "OWNER" && <p className="mt-2 text-sm text-slate-500">Only the Owner can change these.</p>}</div>
    <section className="card p-5 sm:p-7">
      <CompanyForm mode="edit" readOnly={company.role !== "OWNER"} initial={{ name: company.name, business_type: company.business_type, vat_registered: company.vat_registered, vat_number: company.vat_number ? formatVatNumber(company.vat_number) : "", year_end_month: company.year_end_month, year_end_day: company.year_end_day }} />
    </section>
  </div></main>;
}
