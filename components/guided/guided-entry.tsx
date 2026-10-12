"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { recordGuidedTransactionAction } from "@/app/actions/accounting";
import { ownerOptions, type BusinessType } from "@/lib/accounting/bank-inbox";
import { buildGuidedTransaction, categoryOptions, GUIDED_SCENARIOS, isMoneyAccount, PERSONAL_PAYMENT, SCENARIO_INFO, type GuidedAccount, type GuidedInput, type GuidedScenario } from "@/lib/accounting/guided";
import { formatMoney } from "@/lib/ui/format";

const CATEGORY_LABELS: Partial<Record<GuidedScenario, string>> = {
  money_in: "What was it for?",
  money_out: "What did you spend it on?",
  equipment: "Type of equipment",
  pay_hmrc: "Which tax?",
};

function emptyInput(scenario: GuidedScenario, today: string, defaultMoneyAccount: string, businessType: BusinessType): GuidedInput {
  const options = ownerOptions(scenario, businessType);
  return { scenario, entry_date: today, description: "", amount: "", vat_amount: "", account_id: "", money_account_id: defaultMoneyAccount, to_account_id: "", owner_choice: options.length === 1 ? options[0].value : "" };
}

export function GuidedEntry({ accounts, today, initialScenario, showLines, businessType, vatRegistered }: { accounts: GuidedAccount[]; today: string; initialScenario?: GuidedScenario; showLines: boolean; businessType: BusinessType; vatRegistered: boolean }) {
  const router = useRouter();
  const moneyAccounts = accounts.filter((account) => account.is_active && isMoneyAccount(account));
  const defaultMoneyAccount = (accounts.find((account) => account.system_role === "BANK_CURRENT" && account.is_active) ?? moneyAccounts[0])?.id ?? "";
  const [input, setInput] = useState<GuidedInput | null>(initialScenario ? emptyInput(initialScenario, today, defaultMoneyAccount, businessType) : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const names = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);

  if (!input) {
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {GUIDED_SCENARIOS.map((scenario) => <button key={scenario} type="button" onClick={() => { setMessage(null); setInput(emptyInput(scenario, today, defaultMoneyAccount, businessType)); }}
        className="card p-5 text-left transition hover:border-accent hover:shadow-md">
        <span className="block font-semibold">{SCENARIO_INFO[scenario].title}</span>
        <span className="mt-1 block text-sm text-slate-500">{SCENARIO_INFO[scenario].hint}</span>
      </button>)}
    </div>;
  }

  const scenario = input.scenario;
  const set = (patch: Partial<GuidedInput>) => setInput({ ...input, ...patch });
  const categories = categoryOptions(scenario, accounts);
  const allowsVat = vatRegistered && (scenario === "money_in" || scenario === "money_out" || scenario === "equipment");
  const ownerChoices = ownerOptions(scenario, businessType);
  const allowsPersonal = scenario === "money_out" || scenario === "equipment";
  const preview = buildGuidedTransaction(input, accounts);
  const moneyLabel = scenario === "money_in" || scenario === "owner_in" ? "Which account did it go into?" : scenario === "transfer" ? "From" : "How did you pay?";

  async function submit() {
    if (!input) return;
    if (!input.description.trim()) { setMessage({ ok: false, text: "Add a short description so you can recognise this later." }); return; }
    if (!preview.ok) { setMessage({ ok: false, text: preview.error }); return; }
    setBusy(true);
    setMessage(null);
    try {
      const result = await recordGuidedTransactionAction(input);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { setInput(emptyInput(scenario, input.entry_date, input.money_account_id === PERSONAL_PAYMENT ? defaultMoneyAccount : input.money_account_id, businessType)); router.refresh(); }
    } catch {
      setMessage({ ok: false, text: "The transaction could not be saved. Please try again." });
    } finally { setBusy(false); }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <section className="card space-y-5 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">{SCENARIO_INFO[scenario].title}</h2><p className="mt-1 text-sm text-slate-500">{SCENARIO_INFO[scenario].hint}</p></div>
        <button type="button" className="text-sm font-medium text-accent" onClick={() => { setInput(null); setMessage(null); }}>Change</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">When?<input type="date" className="field mt-1.5" value={input.entry_date} onChange={(event) => set({ entry_date: event.target.value })} required /></label>
        <label className="text-sm font-semibold text-slate-700">How much in total? (£)<input inputMode="decimal" className="field mt-1.5" placeholder="0.00" value={input.amount} onChange={(event) => set({ amount: event.target.value })} /></label>
      </div>

      {CATEGORY_LABELS[scenario] && <label className="block text-sm font-semibold text-slate-700">{CATEGORY_LABELS[scenario]}
        <select className="field mt-1.5" value={input.account_id} onChange={(event) => set({ account_id: event.target.value })}>
          <option value="">Choose…</option>
          {categories.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        {!categories.length && <span className="mt-1 block text-xs font-normal text-red-700">No suitable categories are set up yet. Add one under Setup → Categories.</span>}
      </label>}

      {ownerChoices.length > 1 && <fieldset><legend className="text-sm font-semibold text-slate-700">What kind of money is it?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{ownerChoices.map((choice) =>
          <label key={choice.value} className={`cursor-pointer rounded-lg border p-3 text-sm ${input.owner_choice === choice.value ? "border-accent bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name="owner_choice" className="sr-only" checked={input.owner_choice === choice.value} onChange={() => set({ owner_choice: choice.value })} />
            <span className="block font-semibold">{choice.label}</span><span className="mt-0.5 block text-xs text-slate-500">{choice.hint}</span>
          </label>)}
        </div>
      </fieldset>}

      <div className={`grid gap-4 ${scenario === "transfer" ? "sm:grid-cols-2" : ""}`}>
        <label className="block text-sm font-semibold text-slate-700">{moneyLabel}
          <select className="field mt-1.5" value={input.money_account_id} onChange={(event) => set({ money_account_id: event.target.value })}>
            <option value="">Choose…</option>
            {moneyAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            {allowsPersonal && <option value={PERSONAL_PAYMENT}>I paid with my own money</option>}
          </select>
        </label>
        {scenario === "transfer" && <label className="block text-sm font-semibold text-slate-700">To
          <select className="field mt-1.5" value={input.to_account_id} onChange={(event) => set({ to_account_id: event.target.value })}>
            <option value="">Choose…</option>
            {moneyAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>}
      </div>

      {allowsVat && <label className="block text-sm font-semibold text-slate-700">VAT included in the total (£)
        <input inputMode="decimal" className="field mt-1.5" placeholder="Leave blank if there's no VAT" value={input.vat_amount} onChange={(event) => set({ vat_amount: event.target.value })} />
        <span className="mt-1 block text-xs font-normal text-slate-500">Only if the {scenario === "money_in" ? "invoice you issued" : "receipt"} shows VAT.</span>
      </label>}

      <label className="block text-sm font-semibold text-slate-700">Description
        <input className="field mt-1.5" maxLength={2000} placeholder={scenario === "money_out" ? "e.g. Adobe subscription for October" : "A few words to recognise this later"} value={input.description} onChange={(event) => set({ description: event.target.value })} />
      </label>

      {message && <p role="status" className={`rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.ok ? "✓ " : ""}{message.text}{message.ok && <> <Link href="/journal" className="font-semibold underline">View transactions</Link></>}</p>}
      <div className="flex justify-end"><button type="button" className="button" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save transaction"}</button></div>
    </section>

    <aside className="space-y-4">
      <section className="card p-5">
        <h3 className="font-semibold">What this will record</h3>
        {preview.ok ? <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">{preview.summary.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="text-accent">•</span><span>{line}</span></li>)}</ul>
          : <p className="mt-3 text-sm text-slate-500">{input.amount ? preview.error : "Fill in the details and a plain-English summary will appear here."}</p>}
        <p className="mt-4 text-xs text-slate-400">Saving confirms the transaction straight away. To correct it later, undo it from Transactions.</p>
      </section>
      {preview.ok && <details open={showLines} className="card p-5 text-sm">
        <summary className="cursor-pointer font-semibold">Behind the scenes (debits and credits)</summary>
        <p className="mt-2 text-xs text-slate-500">Every transaction is recorded twice, so the books always balance. Your accountant will see it like this:</p>
        <table className="mt-3 w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-1">Account</th><th className="py-1 text-right">Debit</th><th className="py-1 text-right">Credit</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{preview.lines.map((line, index) => <tr key={index}><td className="py-1.5">{names.get(line.account_id)}</td><td className="py-1.5 text-right tabular-nums">{line.debit !== "0" ? formatMoney(line.debit) : ""}</td><td className="py-1.5 text-right tabular-nums">{line.credit !== "0" ? formatMoney(line.credit) : ""}</td></tr>)}</tbody>
        </table>
      </details>}
    </aside>
  </div>;
}
