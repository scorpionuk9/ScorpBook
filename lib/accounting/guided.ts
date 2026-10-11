import Decimal from "decimal.js";
import { formatMoney } from "@/lib/ui/format";

// Guided transactions turn a plain-language answer to "what happened?" into a
// balanced journal entry. The same builder drives the on-screen preview and the
// server, which rebuilds the lines itself rather than trusting the browser.

export const GUIDED_SCENARIOS = ["money_in", "money_out", "equipment", "owner_in", "owner_out", "transfer", "pay_hmrc"] as const;
export type GuidedScenario = (typeof GUIDED_SCENARIOS)[number];

export const SCENARIO_INFO: Record<GuidedScenario, { title: string; hint: string }> = {
  money_in: { title: "Money came in", hint: "A customer paid you, or you received other income." },
  money_out: { title: "I paid for something", hint: "A cost of running the business: software, travel, fees, wages…" },
  equipment: { title: "I bought equipment", hint: "Something the business keeps and uses for years, like a laptop." },
  owner_in: { title: "I put my own money in", hint: "You paid money into the business, or bought shares in it." },
  owner_out: { title: "I took money out", hint: "You took money for yourself, as a loan repayment or a dividend." },
  transfer: { title: "Moved money between accounts", hint: "For example a Stripe payout landing in your bank account." },
  pay_hmrc: { title: "I paid HMRC", hint: "Paying a VAT, Corporation Tax or PAYE bill." },
};

export type GuidedAccount = { id: string; code: string; name: string; type: string; is_active: boolean; system_role: string | null };

export type GuidedInput = {
  scenario: GuidedScenario;
  entry_date: string;
  description: string;
  amount: string;
  vat_amount: string;
  // The category, asset, or HMRC liability the money relates to.
  account_id: string;
  // The bank/payment account money moved through; "personal" means the owner paid personally.
  money_account_id: string;
  // Destination account for transfers.
  to_account_id: string;
  // owner_in: "loan" | "shares"; owner_out: "loan" | "dividend".
  owner_choice: string;
};

export type GuidedLine = { account_id: string; debit: string; credit: string };
export type GuidedResult = { ok: true; lines: GuidedLine[]; summary: string[] } | { ok: false; error: string };

export const PERSONAL_PAYMENT = "personal";
const HMRC_ROLES = ["VAT_PAYABLE", "CORPORATION_TAX_PAYABLE", "PAYE_PAYABLE"];

export function isMoneyAccount(account: GuidedAccount): boolean {
  return account.type === "ASSET" && account.code.startsWith("10");
}

export function isEquipmentAccount(account: GuidedAccount): boolean {
  return account.type === "ASSET" && account.code.startsWith("15") && !account.system_role;
}

// Accounts a scenario lets the user choose as its main category.
export function categoryOptions(scenario: GuidedScenario, accounts: GuidedAccount[]): GuidedAccount[] {
  const active = accounts.filter((account) => account.is_active);
  switch (scenario) {
    case "money_in": return active.filter((account) => account.type === "REVENUE");
    case "money_out": return active.filter((account) => account.type === "EXPENSE" && account.system_role !== "FX_GAINS_LOSSES");
    case "equipment": return active.filter(isEquipmentAccount);
    case "pay_hmrc": return active.filter((account) => account.system_role !== null && HMRC_ROLES.includes(account.system_role));
    default: return [];
  }
}

function parseAmount(value: string, label: string, allowZero: boolean): Decimal | string {
  const trimmed = value.trim().replace(/^£/, "").replace(/,/g, "");
  if (!trimmed) return allowZero ? new Decimal(0) : `Enter the ${label}.`;
  if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(trimmed)) return `Enter the ${label} as a number of pounds, e.g. 120.50.`;
  const amount = new Decimal(trimmed);
  if (!allowZero && amount.isZero()) return `The ${label} must be more than £0.`;
  return amount;
}

const debit = (account_id: string, amount: Decimal): GuidedLine => ({ account_id, debit: amount.toFixed(2), credit: "0" });
const credit = (account_id: string, amount: Decimal): GuidedLine => ({ account_id, debit: "0", credit: amount.toFixed(2) });

export function buildGuidedTransaction(input: GuidedInput, accounts: GuidedAccount[]): GuidedResult {
  const byId = new Map(accounts.filter((account) => account.is_active).map((account) => [account.id, account]));
  const byRole = new Map(accounts.filter((account) => account.is_active && account.system_role).map((account) => [account.system_role!, account]));
  const fail = (error: string): GuidedResult => ({ ok: false, error });
  const role = (name: string) => byRole.get(name);

  const total = parseAmount(input.amount, "amount", false);
  if (typeof total === "string") return fail(total);
  const vat = parseAmount(input.vat_amount, "VAT amount", true);
  if (typeof vat === "string") return fail(vat);
  if (vat.gte(total)) return fail("The VAT must be less than the total amount.");
  const net = total.minus(vat);
  const money = (id: string) => { const account = byId.get(id); return account && isMoneyAccount(account) ? account : undefined; };
  const category = () => { const account = byId.get(input.account_id); return account && categoryOptions(input.scenario, accounts).some((option) => option.id === account.id) ? account : undefined; };
  const directorsLoan = role("DIRECTORS_LOAN");

  // Resolves where money came from or went to: a bank/payment account, or the owner personally.
  const source = (): { account: GuidedAccount; personal: boolean } | string => {
    if (input.money_account_id === PERSONAL_PAYMENT) {
      return directorsLoan ? { account: directorsLoan, personal: true } : "A Director's Loan Account is needed to record personal payments. Ask your accountant to set one up.";
    }
    const account = money(input.money_account_id);
    return account ? { account, personal: false } : "Choose which account the money moved through.";
  };

  switch (input.scenario) {
    case "money_in": {
      const income = category();
      if (!income) return fail("Choose what the money was for.");
      const into = money(input.money_account_id);
      if (!into) return fail("Choose which account the money arrived in.");
      const vatAccount = role("VAT_PAYABLE");
      if (vat.gt(0) && !vatAccount) return fail("A VAT Payable account is needed to record VAT.");
      const lines = [debit(into.id, total), credit(income.id, net)];
      if (vat.gt(0)) lines.push(credit(vatAccount!.id, vat));
      return { ok: true, lines, summary: [
        `${into.name} goes up by ${formatMoney(total)}.`,
        `${formatMoney(net)} counts as income under “${income.name}”.`,
        ...(vat.gt(0) ? [`${formatMoney(vat)} is VAT you collected for HMRC. It's added to the VAT you'll pay on your next return.`] : []),
      ] };
    }
    case "money_out":
    case "equipment": {
      const target = category();
      if (!target) return fail(input.scenario === "money_out" ? "Choose what the money was spent on." : "Choose the type of equipment.");
      const from = source();
      if (typeof from === "string") return fail(from);
      const vatAccount = role("VAT_RECOVERABLE");
      if (vat.gt(0) && !vatAccount) return fail("A VAT Recoverable account is needed to record VAT.");
      const lines = [debit(target.id, net), ...(vat.gt(0) ? [debit(vatAccount!.id, vat)] : []), credit(from.account.id, total)];
      return { ok: true, lines, summary: [
        from.personal ? `You paid ${formatMoney(total)} personally, so the business now owes you that amount (recorded on your Director's Loan Account).` : `${from.account.name} goes down by ${formatMoney(total)}.`,
        input.scenario === "money_out"
          ? `${formatMoney(net)} is recorded as a cost under “${target.name}”, which reduces your profit.`
          : `${formatMoney(net)} is recorded as equipment the business owns (“${target.name}”). It doesn't reduce profit straight away; its cost is spread over the years you use it.`,
        ...(vat.gt(0) ? [`${formatMoney(vat)} is VAT you can reclaim from HMRC on your next VAT return.`] : []),
      ] };
    }
    case "owner_in": {
      if (vat.gt(0)) return fail("VAT doesn't apply to money you put into your own business.");
      const into = money(input.money_account_id);
      if (!into) return fail("Choose which account the money arrived in.");
      const target = input.owner_choice === "shares" ? role("SHARE_CAPITAL") : input.owner_choice === "loan" ? directorsLoan : undefined;
      if (!target) return fail(input.owner_choice ? "The account needed for this isn't set up yet. Ask your accountant." : "Choose whether this is a loan or a payment for shares.");
      return { ok: true, lines: [debit(into.id, total), credit(target.id, total)], summary: [
        `${into.name} goes up by ${formatMoney(total)}.`,
        input.owner_choice === "loan"
          ? `The business owes you ${formatMoney(total)}, which you can take back later without paying tax on it.`
          : `${formatMoney(total)} is recorded as money paid for shares in the company. It stays in the business and isn't normally paid back.`,
      ] };
    }
    case "owner_out": {
      if (vat.gt(0)) return fail("VAT doesn't apply to money you take out of your own business.");
      const from = money(input.money_account_id);
      if (!from) return fail("Choose which account the money left from.");
      const target = input.owner_choice === "dividend" ? role("DIVIDENDS") : input.owner_choice === "loan" ? directorsLoan : undefined;
      if (!target) return fail(input.owner_choice ? "The account needed for this isn't set up yet. Ask your accountant." : "Choose whether this is a loan repayment or a dividend.");
      return { ok: true, lines: [debit(target.id, total), credit(from.id, total)], summary: [
        `${from.name} goes down by ${formatMoney(total)}.`,
        input.owner_choice === "loan"
          ? `${formatMoney(total)} comes off what the business owes you. If you take out more than you've put in, the business is lending to you, which can have tax consequences. Check with your accountant.`
          : `${formatMoney(total)} is recorded as a dividend. Dividends can only be paid from profits the company has made after tax. Check with your accountant if you're unsure.`,
      ] };
    }
    case "transfer": {
      if (vat.gt(0)) return fail("VAT doesn't apply to moving money between your own accounts.");
      const from = money(input.money_account_id);
      const to = money(input.to_account_id);
      if (!from || !to) return fail("Choose both the account the money left and the one it arrived in.");
      if (from.id === to.id) return fail("Choose two different accounts.");
      return { ok: true, lines: [debit(to.id, total), credit(from.id, total)], summary: [
        `${formatMoney(total)} moves from ${from.name} to ${to.name}. Your total money doesn't change.`,
      ] };
    }
    case "pay_hmrc": {
      if (vat.gt(0)) return fail("Leave VAT blank: the payment itself is the tax.");
      const liability = category();
      if (!liability) return fail("Choose which tax you paid.");
      const from = money(input.money_account_id);
      if (!from) return fail("Choose which account you paid from.");
      return { ok: true, lines: [debit(liability.id, total), credit(from.id, total)], summary: [
        `${from.name} goes down by ${formatMoney(total)}.`,
        `What you owe HMRC for ${liability.name.replace(/ Payable$/, "")} goes down by ${formatMoney(total)}. This settles a tax bill rather than counting as a new cost. If the bill itself hasn't been recorded yet (your accountant usually does this), ask them to add it.`,
      ] };
    }
  }
}
