"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { categoriseBankFeedLineAction, matchBankFeedLineAction, setBankFeedLineIgnoredAction } from "@/app/actions/banking";
import { BANK_SCENARIO_LABELS, findRule, isMoneyIn, scenariosFor, suggestKeyword, toGuidedInput, type BankChoice, type BankFeedLine, type BankRule } from "@/lib/accounting/bank-inbox";
import { buildGuidedTransaction, categoryOptions, isMoneyAccount, type GuidedAccount, type GuidedScenario } from "@/lib/accounting/guided";
import type { BankMatchCandidate } from "@/lib/accounting/service";
import { formatMoney } from "@/lib/ui/format";

const OWNER_OPTIONS: Partial<Record<GuidedScenario, Array<{ value: string; label: string }>>> = {
  owner_in: [{ value: "loan", label: "Loan to the business" }, { value: "shares", label: "Payment for shares" }],
  owner_out: [{ value: "loan", label: "Taking back money I lent" }, { value: "dividend", label: "Dividend" }],
};

function choiceFromRule(rule: BankRule | undefined, line: BankFeedLine): BankChoice | null {
  if (!rule || !scenariosFor(line).includes(rule.scenario as GuidedScenario)) return null;
  return { scenario: rule.scenario as GuidedScenario, account_id: rule.account_id ?? "", owner_choice: rule.owner_choice ?? "", vat_amount: "" };
}

function defaultChoice(line: BankFeedLine): BankChoice {
  return { scenario: isMoneyIn(line) ? "money_in" : "money_out", account_id: "", owner_choice: "", vat_amount: "" };
}

function InboxRow({ line, accounts, rules, candidates, simple }: { line: BankFeedLine; accounts: GuidedAccount[]; rules: BankRule[]; candidates: BankMatchCandidate[]; simple: boolean }) {
  const router = useRouter();
  const rule = findRule(rules, line);
  const [choice, setChoice] = useState<BankChoice>(choiceFromRule(rule, line) ?? defaultChoice(line));
  const [remember, setRemember] = useState(false);
  const [keyword, setKeyword] = useState(rule?.match_text ?? suggestKeyword(line.description));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const incoming = isMoneyIn(line);
  const result = buildGuidedTransaction(toGuidedInput(line, choice), accounts);
  const transferAccounts = accounts.filter((account) => account.is_active && isMoneyAccount(account) && account.id !== line.bank_account_id);
  const options = choice.scenario === "transfer" ? transferAccounts : categoryOptions(choice.scenario, accounts);
  const allowsVat = ["money_in", "money_out", "equipment"].includes(choice.scenario);

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true); setError("");
    const outcome = await action();
    setBusy(false);
    if (outcome.ok) router.refresh(); else setError(outcome.message);
  }
  const save = () => run(() => categoriseBankFeedLineAction({ line_id: line.id, ...choice, remember_text: remember ? keyword : undefined }));
  const form = (fields: Record<string, string>) => { const data = new FormData(); Object.entries(fields).forEach(([key, value]) => data.set(key, value)); return data; };

  return <li className="space-y-3 py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><p className="font-medium">{line.description}</p><p className="text-xs text-slate-500">{new Date(`${line.transaction_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}{line.reference ? ` · ${line.reference}` : ""}</p></div>
      <p className={`text-lg font-semibold tabular-nums ${incoming ? "text-emerald-700" : ""}`}>{incoming ? "+" : ""}{formatMoney(line.amount)}</p>
    </div>

    {candidates.length > 0 && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <p className="font-medium text-emerald-900">This looks like something already recorded:</p>
      <ul className="mt-2 space-y-2">{candidates.map((candidate) => <li key={candidate.journal_line_id} className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-emerald-900">{candidate.description || candidate.entry_number} · {candidate.entry_date}{!simple && <span className="ml-1 font-mono text-xs">{candidate.entry_number}</span>}</span>
        <button type="button" className="button px-3 py-1.5 text-xs" disabled={busy} onClick={() => void run(() => matchBankFeedLineAction(form({ line_id: line.id, journal_line_id: candidate.journal_line_id })))}>Yes, same thing</button>
      </li>)}</ul>
    </div>}

    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_8rem]">
      <select aria-label="What is this?" className="field" value={choice.scenario} onChange={(event) => setChoice({ scenario: event.target.value as GuidedScenario, account_id: "", owner_choice: "", vat_amount: "" })}>
        {scenariosFor(line).map((scenario) => <option key={scenario} value={scenario}>{BANK_SCENARIO_LABELS[scenario]}</option>)}
      </select>
      {OWNER_OPTIONS[choice.scenario]
        ? <select aria-label="What kind?" className="field" value={choice.owner_choice} onChange={(event) => setChoice({ ...choice, owner_choice: event.target.value })}>
            <option value="">Choose…</option>{OWNER_OPTIONS[choice.scenario]!.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        : <select aria-label={choice.scenario === "transfer" ? (incoming ? "From which account?" : "To which account?") : "Category"} className="field" value={choice.account_id} onChange={(event) => setChoice({ ...choice, account_id: event.target.value })}>
            <option value="">{choice.scenario === "transfer" ? (incoming ? "From which account?" : "To which account?") : "Choose a category…"}</option>
            {options.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>}
      {allowsVat ? <input aria-label="VAT included" inputMode="decimal" className="field" placeholder="VAT £ (if any)" value={choice.vat_amount} onChange={(event) => setChoice({ ...choice, vat_amount: event.target.value })} /> : <span />}
    </div>

    {result.ok && <p className="text-xs text-slate-500">{result.summary.join(" ")}</p>}
    {rule && <p className="text-xs text-accent">Suggested by your rule for “{rule.match_text}”.</p>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      {!rule ? <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
        Always treat transactions containing
        <input aria-label="Text to remember" className="field w-40 py-1 text-xs" value={keyword} onChange={(event) => setKeyword(event.target.value)} disabled={!remember} />
        like this
      </label> : <span />}
      <div className="flex gap-2">
        <button type="button" className="button-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => void run(() => setBankFeedLineIgnoredAction(form({ line_id: line.id, ignored: "true" })))} title="For duplicates or lines that don't belong in the books">Ignore</button>
        <button type="button" className="button px-3 py-1.5 text-xs" disabled={busy || !result.ok} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </li>;
}

export function BankInbox({ lines, accounts, rules, candidates, simple }: { lines: BankFeedLine[]; accounts: GuidedAccount[]; rules: BankRule[]; candidates: Record<string, BankMatchCandidate[]>; simple: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  // Lines a rule fully decides, with no possible duplicate to check first.
  const ready = useMemo(() => lines.flatMap((line) => {
    const choice = choiceFromRule(findRule(rules, line), line);
    if (!choice || candidates[line.id]?.length) return [];
    return buildGuidedTransaction(toGuidedInput(line, choice), accounts).ok ? [{ line, choice }] : [];
  }), [lines, rules, candidates, accounts]);

  async function confirmAll() {
    setBusy(true);
    let failed = 0;
    for (const [index, item] of ready.entries()) {
      setProgress(`Saving ${index + 1} of ${ready.length}…`);
      const result = await categoriseBankFeedLineAction({ line_id: item.line.id, ...item.choice });
      if (!result.ok) failed++;
    }
    setBusy(false);
    setProgress(failed ? `${failed} couldn't be saved; check them below.` : "");
    router.refresh();
  }

  if (!lines.length) return <p className="rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800">✓ Nothing to sort out. Upload a new statement when you have one.</p>;
  return <section className="card px-5">
    {ready.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4">
      <p className="text-sm">{ready.length} transaction{ready.length === 1 ? "" : "s"} can be saved using your rules.</p>
      <div className="flex items-center gap-3">{progress && <span className="text-xs text-slate-500">{progress}</span>}<button type="button" className="button" disabled={busy} onClick={() => void confirmAll()}>Save all suggested</button></div>
    </div>}
    <ul className="divide-y divide-slate-100">{lines.map((line) => <InboxRow key={line.id} line={line} accounts={accounts} rules={rules} candidates={candidates[line.id] ?? []} simple={simple} />)}</ul>
  </section>;
}
