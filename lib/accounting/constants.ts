export const SCORPBOOK_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export const ENTRY_SOURCES = ["MANUAL", "BANK_IMPORT", "SCORPINVOICE"] as const;

export const ACCOUNT_TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  ASSET: "資產",
  LIABILITY: "負債",
  EQUITY: "權益",
  REVENUE: "收入",
  EXPENSE: "費用",
};

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  POSTED: "已過帳",
  VOIDED: "已作廢",
};
