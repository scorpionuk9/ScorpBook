export const VIEW_MODES = ["simple", "accountant"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const VIEW_MODE_COOKIE = "scorpbook_view_mode";

export function parseViewMode(value: string | undefined): ViewMode {
  return value === "accountant" ? "accountant" : "simple";
}

// Page and navigation wording for each mode. Simple mode avoids bookkeeping jargon;
// accountant mode keeps the standard terms used in reports and by accountants.
export const LABELS = {
  simple: {
    home: "Home",
    journal: "Transactions",
    journalIntro: "Every money movement recorded in your books. Confirmed transactions can't be edited; undo one to correct it.",
    accounts: "Categories",
    accountsIntro: "The categories your money is sorted into. Categories can be switched off but never deleted, so past records stay intact.",
    suppliers: "Suppliers",
    bills: "Bills to pay",
    bankInbox: "Bank",
    banking: "Bank check",
    bankingIntro: "Upload your bank statement and tick off each line against your records, so you know the books match the bank.",
    periods: "Month-end",
    periodsIntro: "Lock a finished month once everything is recorded and the bank is checked. Locked months can't be changed.",
    reports: "Reports",
    incomeStatement: "Profit & loss",
    incomeStatementIntro: "Money earned minus costs in the selected period.",
    balanceSheet: "What you own & owe",
    balanceSheetIntro: "A snapshot of what the business owns, what it owes, and what's left for the owners on the selected date.",
    trialBalance: "Trial balance",
    vatReturn: "VAT return",
    setup: "Setup",
  },
  accountant: {
    home: "Dashboard",
    journal: "Journal",
    journalIntro: "Showing the latest 100 entries. Posted entries are immutable; create a reversal to correct one.",
    accounts: "Chart of Accounts",
    accountsIntro: "Manage your company accounts. Inactive accounts remain on historical entries but cannot be used on new drafts.",
    suppliers: "Suppliers",
    bills: "Bills",
    bankInbox: "Bank feed",
    banking: "Bank reconciliation",
    bankingIntro: "Import statement activity, match it to posted bank ledger entries, and verify each period.",
    periods: "Periods",
    periodsIntro: "Close a month after posting its journals, resolving draft bills, and completing bank reconciliations. Closed periods are permanently locked.",
    reports: "Reports",
    incomeStatement: "Income statement",
    incomeStatementIntro: "Revenue and expenses from posted entries in the selected period.",
    balanceSheet: "Balance sheet",
    balanceSheetIntro: "Assets, liabilities, and equity as of the selected date.",
    trialBalance: "Trial balance",
    vatReturn: "VAT return",
    setup: "Setup",
  },
} as const satisfies Record<ViewMode, Record<string, string>>;

export const SIMPLE_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "Something you own",
  LIABILITY: "Something you owe",
  EQUITY: "Owners' money",
  REVENUE: "Money in",
  EXPENSE: "Cost",
};
