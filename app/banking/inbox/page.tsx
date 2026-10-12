import Link from "next/link";
import { requireAccountingUser } from "@/lib/accounting/auth";
import { listAccounts, listBankFeedLines, listBankMatchCandidates, listBankRules } from "@/lib/accounting/service";
import { BANK_SCENARIO_LABELS } from "@/lib/accounting/bank-inbox";
import { isMoneyAccount, type GuidedScenario } from "@/lib/accounting/guided";
import { deleteBankRuleAction, setBankFeedLineIgnoredAction } from "@/app/actions/banking";
import { getViewMode } from "@/lib/ui/view-mode-server";
import { formatMoney } from "@/lib/ui/format";
import { BankImport } from "@/components/banking/bank-import";
import { BankInbox } from "@/components/banking/bank-inbox";
import { FormActionButton } from "@/components/banking/form-action-button";

export const dynamic = "force-dynamic";

const TABS = [{ key: "todo", label: "To do", status: "NEW" }, { key: "done", label: "Done", status: "DONE" }, { key: "ignored", label: "Ignored", status: "IGNORED" }] as const;

type InboxPageProps = { searchParams: Promise<{ view?: string | string[] }> };

export default async function BankInboxPage({ searchParams }: InboxPageProps) {
  await requireAccountingUser();
  const params = await searchParams;
  const tab = TABS.find((item) => item.key === (Array.isArray(params.view) ? params.view[0] : params.view)) ?? TABS[0];
  const [accounts, lines, rules, mode] = await Promise.all([listAccounts(), listBankFeedLines(tab.status), listBankRules(), getViewMode()]);
  const simple = mode === "simple";
  const candidates = tab.status === "NEW" ? Object.fromEntries(await listBankMatchCandidates(lines)) : {};
  const moneyAccounts = accounts.filter((account) => account.is_active && isMoneyAccount(account));
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const defaultAccount = accounts.find((account) => account.system_role === "BANK_CURRENT")?.id ?? moneyAccounts[0]?.id ?? "";

  return <main className="mx-auto w-full max-w-5xl px-5 py-8"><div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold text-accent">BANK</p><h1 className="mt-1 text-3xl font-bold">{simple ? "Bank transactions" : "Bank feed"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Upload your bank statement, then say what each payment was. ScorpBook remembers your answers, so next month most of it is done for you.</p></div>
      <Link href="/banking" className="text-sm font-medium text-slate-500 hover:text-accent">{simple ? "Bank check (month end) →" : "Bank reconciliation →"}</Link>
    </div>

    {moneyAccounts.length ? <BankImport accounts={moneyAccounts.map(({ id, name }) => ({ id, name }))} defaultAccountId={defaultAccount} />
      : <p className="text-sm text-amber-800">Add an active bank account (a 10xx asset category) before uploading statements.</p>}

    <nav className="flex gap-1 border-b border-slate-200 text-sm">{TABS.map((item) =>
      <Link key={item.key} href={item.key === "todo" ? "/banking/inbox" : `/banking/inbox?view=${item.key}`} className={`-mb-px border-b-2 px-4 py-2 ${item.key === tab.key ? "border-accent font-semibold text-accent" : "border-transparent text-slate-500 hover:text-ink"}`}>{item.label}{item.key === "todo" && tab.key === "todo" && lines.length ? ` (${lines.length})` : ""}</Link>)}
    </nav>

    {tab.status === "NEW"
      ? <BankInbox lines={lines} accounts={accounts} rules={rules} candidates={candidates} simple={simple} />
      : <section className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">{lines.map((line) => <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div><p>{line.description}</p><p className="text-xs text-slate-500">{line.transaction_date} · {names.get(line.bank_account_id)}{line.entry_number ? <> · <Link href="/journal" className="text-accent">{simple ? (line.matched_journal_line_id ? "Matched to " : "Recorded as ") : ""}{line.entry_number}</Link></> : ""}</p></div>
            <div className="flex items-center gap-3"><span className="tabular-nums">{formatMoney(line.amount)}</span>
              {line.status === "IGNORED" && <FormActionButton action={setBankFeedLineIgnoredAction} fields={{ line_id: line.id, ignored: "false" }} label="Move back to To do" />}</div>
          </li>)}
          {!lines.length && <li className="px-5 py-10 text-center text-sm text-slate-500">Nothing here yet.</li>}</ul>
        </section>}

    <section className="card p-5">
      <h2 className="font-semibold">Your rules</h2>
      <p className="mt-1 text-sm text-slate-500">Created when you tick &quot;Always treat transactions containing…&quot;. Rules only suggest; nothing is saved until you confirm it.</p>
      {rules.length ? <ul className="mt-3 divide-y divide-slate-100 text-sm">{rules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>Money {rule.direction === "IN" ? "in" : "out"} containing <strong>“{rule.match_text}”</strong> → {BANK_SCENARIO_LABELS[rule.scenario as GuidedScenario] ?? rule.scenario}{rule.account_id ? `: ${names.get(rule.account_id) ?? ""}` : ""}{rule.owner_choice ? ` (${rule.owner_choice})` : ""}</span>
        <FormActionButton action={deleteBankRuleAction} fields={{ rule_id: rule.id }} label="Remove" pendingLabel="Removing…" />
      </li>)}</ul> : <p className="mt-3 text-sm text-slate-400">No rules yet.</p>}
    </section>
  </div></main>;
}
