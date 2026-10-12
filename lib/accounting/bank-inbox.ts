import Decimal from "decimal.js";
import type { GuidedInput, GuidedScenario } from "@/lib/accounting/guided";

// Turns an imported bank line plus the user's choice into a guided transaction.
// Shared by the inbox UI (preview) and the server (which rebuilds the entry).

export type BankFeedLine = { id: string; bank_account_id: string; transaction_date: string; description: string; reference: string | null; amount: string };
export type BankRule = { id: string; match_text: string; direction: "IN" | "OUT"; scenario: string; account_id: string | null; owner_choice: string | null };
export type BankChoice = { scenario: GuidedScenario; account_id: string; owner_choice: string; vat_amount: string };

export type BusinessType = "LIMITED_COMPANY" | "SOLE_TRADER";

// How an owner's own money in/out can be recorded; sole traders have one option each.
export function ownerOptions(scenario: GuidedScenario, businessType: BusinessType): Array<{ value: string; label: string; hint: string }> {
  if (businessType === "SOLE_TRADER") {
    if (scenario === "owner_in") return [{ value: "capital", label: "Money I put into the business", hint: "Your own savings paid in." }];
    if (scenario === "owner_out") return [{ value: "drawings", label: "Money I took for myself", hint: "Drawings: not a business cost." }];
    return [];
  }
  if (scenario === "owner_in") return [
    { value: "loan", label: "A loan to the business", hint: "You can take it back later, tax-free. Most common." },
    { value: "shares", label: "Payment for shares", hint: "Usually only when the company is set up." },
  ];
  if (scenario === "owner_out") return [
    { value: "loan", label: "Taking back money I lent", hint: "Repaying money you put in or paid personally." },
    { value: "dividend", label: "A dividend", hint: "A share of the company's after-tax profits." },
  ];
  return [];
}

export const IN_SCENARIOS: GuidedScenario[] = ["money_in", "owner_in", "transfer"];
export const OUT_SCENARIOS: GuidedScenario[] = ["money_out", "equipment", "owner_out", "transfer", "pay_hmrc"];

export const BANK_SCENARIO_LABELS: Record<GuidedScenario, string> = {
  money_in: "Income",
  money_out: "A cost",
  equipment: "Equipment",
  owner_in: "My own money in",
  owner_out: "Money I took out",
  transfer: "Transfer between my accounts",
  pay_hmrc: "Paid HMRC",
};

export function isMoneyIn(line: Pick<BankFeedLine, "amount">): boolean {
  return new Decimal(line.amount).gt(0);
}

export function scenariosFor(line: Pick<BankFeedLine, "amount">): GuidedScenario[] {
  return isMoneyIn(line) ? IN_SCENARIOS : OUT_SCENARIOS;
}

export function toGuidedInput(line: BankFeedLine, choice: BankChoice): GuidedInput {
  const transfer = choice.scenario === "transfer";
  const incoming = isMoneyIn(line);
  return {
    scenario: choice.scenario,
    entry_date: line.transaction_date,
    description: line.description,
    amount: new Decimal(line.amount).abs().toFixed(2),
    vat_amount: choice.vat_amount,
    account_id: transfer ? "" : choice.account_id,
    // For transfers the chosen account is the other side of the move.
    money_account_id: transfer && incoming ? choice.account_id : line.bank_account_id,
    to_account_id: transfer ? (incoming ? line.bank_account_id : choice.account_id) : "",
    owner_choice: choice.owner_choice,
  };
}

export function findRule(rules: BankRule[], line: BankFeedLine): BankRule | undefined {
  const text = `${line.description} ${line.reference ?? ""}`.toLowerCase();
  const direction = isMoneyIn(line) ? "IN" : "OUT";
  // Longest matching text wins, so "AMAZON WEB SERVICES" beats "AMAZON".
  return rules
    .filter((rule) => rule.direction === direction && text.includes(rule.match_text.trim().toLowerCase()))
    .sort((a, b) => b.match_text.length - a.match_text.length)[0];
}

// A sensible default for "remember this": the first words of the description,
// without card numbers, dates and reference codes that change every time.
export function suggestKeyword(description: string): string {
  const words = description
    .replace(/[*#]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !/\d{2,}/.test(word) && !/^(card|payment|to|from|ref|dd|so|fpi|fpo|bgc|pos|vis|visa|debit|credit)$/i.test(word));
  return words.slice(0, 2).join(" ").slice(0, 60);
}
