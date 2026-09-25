# Scorpia Tech Ltd - 會計軟件開發規範與 CODEX 指導文件

本文件為 **Scorpia Tech Ltd** 開發自用暨商業化會計軟件（代號：ScorpBook）的完整技術規範與 CODEX 開發指引。

---

## 壹、 產品路線圖 (Roadmap)

### Phase 1：自用 MVP (Minimum Viable Product)
**目標**：滿足 Scorpia Tech Ltd 自身的財務核算、報稅準備以及與 **ScorpInvoice** 的自動對接。

1. **核心複式簿記引擎 (Core Double-Entry Ledger)**：
   - 會計科目表 (Chart of Accounts) 管理。
   - 日記帳憑證 (Journal Entries & Lines) 建立、過帳 (Post) 與沖銷 (Reversing Entries)。
   - 自動借貸平衡強驗證 ($\sum \text{Debit} = \sum \text{Credit}$)。
2. **ScorpInvoice Webhook 對接模組**：
   - 接收 ScorpInvoice 的 `invoice.issued` 與 `invoice.paid` 事件。
   - 自動生成對應的應收帳款與銀行入帳日記帳憑證。
3. **基礎財務報表生成**：
   - 試算表 (Trial Balance)
   - 損益表 (Income Statement / P&L)
   - 資產負債表 (Balance Sheet)
4. **支出與供應商管理 (Expenses & Bills)**：
   - 手動錄入日常公司支出與外包費用。

---

### Phase 2：商用 SaaS 升級 (Market Launch)
**目標**：轉化為多租戶 (Multi-Tenant) 雲端會計 SaaS 產品，開放給外部企業使用。

1. **多租戶架構 (Multi-Tenancy & RLS)**：
   - 引入 `organization_id`，利用 Supabase Row Level Security (RLS) 實現嚴格的租戶數據隔離。
   - 支援基於角色的權限控制 (RBAC：Owner, Accountant, Auditor)。
2. **開放式 API 與 Webhook 網關**：
   - 開放標準 Webhook API，允許外部系統（如 Stripe, Shopify, 自建 POS）對接。
3. **AI 自動化與 OCR 憑證辨識**：
   - 整合 OpenAI / Claude 進行收據與發票 OCR 自動辨識並產生支出憑證。
   - AI 智能對帳與科目建議。
4. **多幣別與稅務合規**：
   - 實時匯率換算與匯兌損益 (Realized/Unrealized Gain/Loss) 計算。
   - 各國/地區增值稅/營業稅 (VAT/GST) 自動結算報表。

---

## 貳、 數據庫 Schema 設計 (PostgreSQL / Supabase)

會計系統要求高數據一致性與審計追溯能力，採用以下 PostgreSQL Schema：

```sql
-- 1. 啟用 UUID 擴充
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 會計科目表 (Chart of Accounts)
CREATE TABLE public.accounting_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- 用於 Phase 2 多租戶隔離
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_account_code UNIQUE (tenant_id, code)
);

-- 3. 會計憑證主表 (Journal Entries)
CREATE TABLE public.accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entry_number VARCHAR(50) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    source_type VARCHAR(50) NOT NULL, -- 例如: 'SCORPINVOICE', 'MANUAL', 'BANK_IMPORT'
    source_id VARCHAR(100),            -- 外部發票或交易 ID
    source_event VARCHAR(50),         -- 例如: 'ISSUED', 'PAID'
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_entry_number UNIQUE (tenant_id, entry_number)
);

-- 4. 會計憑證明細表 (Journal Lines)
CREATE TABLE public.accounting_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES public.accounting_journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounting_accounts(id),
    description TEXT,
    debit NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (debit >= 0),
    credit NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (credit >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_debit_credit_mutually_exclusive CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    )
);

-- 5. 冪等性紀錄表 (Webhook Idempotency)
CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_id VARCHAR(100) NOT NULL UNIQUE,
    source_system VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引優化
CREATE INDEX idx_journal_entries_tenant_date ON public.accounting_journal_entries(tenant_id, entry_date);
CREATE INDEX idx_journal_lines_entry_id ON public.accounting_journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account_id ON public.accounting_journal_lines(account_id);
```

---

## 參、 TypeScript 數據類型定義 (`types/accounting.ts`)

```typescript
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type EntryStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export interface AccountingAccount {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: AccountType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalLineInput {
  account_id: string;
  description?: string;
  debit: number;
  credit: number;
}

export interface JournalEntryInput {
  tenant_id: string;
  entry_number?: string;
  entry_date: string;
  description: string;
  source_type: 'SCORPINVOICE' | 'MANUAL' | 'BANK_IMPORT';
  source_id?: string;
  source_event?: string;
  lines: JournalLineInput[];
}

export interface ScorpInvoiceWebhookPayload {
  event_id: string;
  tenant_id: string;
  invoice_id: string;
  invoice_number: string;
  status: 'ISSUED' | 'PAID' | 'CANCELLED';
  total_amount: number;
  currency: string;
  customer_name: string;
  timestamp: string;
}
```

---

## 肆、 ScorpInvoice Webhook 對接規範

由於 **ScorpInvoice** 是公眾 App，必須採用**非同步 Webhook 模式**，透過 HMAC SHA256 進行數據驗證。

### 1. 請求頭與驗證機制
- **HTTP Header**: `X-ScorpInvoice-Signature`
- **算法**: `HMAC-SHA256(payload_body, secret_key)`

### 2. 會計分錄映射邏輯

| ScorpInvoice 狀態 | 會計動作 | 借方 (Debit) | 貸方 (Credit) |
| :--- | :--- | :--- | :--- |
| **`ISSUED`** (開立發票) | 應收帳款認列 | **1100 應收帳款** (+Amount) | **4000 營業收入** (+Amount) |
| **`PAID`** (完成付款) | 應收帳款沖銷 / 資金入帳 | **1000 銀行存款 / Stripe 戶** (+Amount) | **1100 應收帳款** (-Amount) |
| **`CANCELLED`** (廢止發票) | 發票沖銷 (Reversing) | **4000 營業收入** (-Amount) | **1100 應收帳款** (-Amount) |

---

## 伍、 CODEX 開發指引文件 (`.codex/instructions.md`)

請將以下內容直接複製並存為專案根目錄下的 `.codex/instructions.md`，做為 CODEX 生成程式碼的控制標準。

```markdown:.codex/instructions.md:.codex/instructions.md
# CODEX Development Instructions - Scorpia Tech Accounting Core

You are acting as a Senior Full-Stack Engineer and Certified Financial Systems Architect for Scorpia Tech Ltd.
Your primary role is to build a robust, precision-first, and audit-compliant accounting platform using Next.js (App Router), TypeScript, Tailwind CSS, and Supabase (PostgreSQL).

## 1. Absolute Financial Engineering Principles (NON-NEGOTIABLE)

### A. Precision & Floating Point Safety
- NEVER use standard JavaScript `number` arithmetic for financial balances or aggregations.
- ALL internal currency calculations MUST use high-precision packages like `decimal.js` or `big.js`.
- Database amounts MUST be stored as `NUMERIC(15, 4)`.

### B. Double-Entry Bookkeeping Rule
- Every journal entry MUST satisfy: Sum of Debits == Sum of Credits.
- If an entry fails this equation, reject the database transaction immediately.
- A single journal line MUST NOT contain both `debit > 0` and `credit > 0`. One side must be zero.

### C. Immutability & Audit Trail
- Posted journal entries (`status = 'POSTED'`) CANNOT be edited or deleted.
- Corrections must be performed by creating a **Reversing Entry** (沖銷單) or a Adjustment Entry with full event logging.

---

## 2. Tech Stack & Coding Standards

- **Framework**: Next.js 14+ (App Router, Server Actions, React Server Components).
- **Database**: Supabase PostgreSQL with TypeScript types generated via Supabase CLI.
- **UI Components**: Tailwind CSS + `shadcn/ui` + `lucide-react`.
- **Validation**: `zod` for all form and API inputs.

---

## 3. Webhook Integration Rules (ScorpInvoice)

When handling incoming webhooks from ScorpInvoice:
1. **Always Verify HMAC Signature**: Reject HTTP requests if the signature does not match `process.env.SCORPINVOICE_WEBHOOK_SECRET`.
2. **Idempotency Check**: Check `webhook_events` table using `event_id` before performing any database transactions. If `event_id` exists, return HTTP 200 immediately without reprocessing.
3. **Atomic Transactions**: Creating the journal entry and journal lines must execute inside a single PostgreSQL Transaction.

---

## 4. Response & Code Generation Style

- Write clean, type-safe TypeScript code with explicit return types.
- Always include error handling with clear, user-friendly messages.
- Add concise comments explaining financial logic where applicable.
```

---

## 陸、 給 CODEX 的啟動提示詞 (Prompt Template)

當你開始讓 CODEX 開發特定模組時，可以複製以下提示詞：

```text
請參照 .codex/instructions.md 的規範，幫我實作 Next.js App Router 下的 API Route (/app/api/webhooks/scorpinvoice/route.ts)。

需求：
1. 接收來自 ScorpInvoice 的 Webhook Payload。
2. 完成 HMAC SHA256 簽名驗證與 idempotency（冪等性）檢查。
3. 若狀態為 'ISSUED' 或 'PAID'，請開啟 Supabase Transaction，自動寫入 accounting_journal_entries 與 accounting_journal_lines。
4. 必須嚴格遵守借貸平衡與高精度計算（使用 decimal.js）。
```
## Supabase API Integration Rules
1. Client-side requests MUST use the `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variable.
2. Server-side / Webhook operations requiring database write bypass MUST use the `SUPABASE_SERVICE_ROLE_KEY` environment variable. Never expose this key to client code or commit its value.
3. All database queries must be strongly typed using Supabase generated types (`types/supabase.ts`).
