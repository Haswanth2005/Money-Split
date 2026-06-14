# 🤖 AI_USAGE.md — AI Tool Usage Log

This document records the interaction logs, system prompts, and collaborative adjustments made in partnership with AI assistants during development.

---

## 🛠️ Tools Used

| Tool | Purpose / Scope |
| :--- | :--- |
| **Google Gemini / Antigravity IDE** | **Primary development assistant** — Code scaffolding, schema modeling, anomaly engine design, and automated debugging. |
| **Model:** Claude 3.5 Sonnet (Thinking) | Switched mid-session for deep reasoning, complex logical audits, and edge-case resolution. |

---

## 🔑 Key Prompts

### 📥 Prompt 1 — Fault-Tolerant CSV Import Feature
> *"Your app must include an import feature that ingests `expenses_export.csv` exactly as provided. Editing the CSV by hand before importing is not allowed. The file contains at least 12 deliberate data problems. For each problem, your importer must: 1. Detect it 2. Surface it to the user 3. Handle it according to a policy you choose and document."*

* **Outcome:** Scaffolding of the entire ingestion pipeline. Generated [csvParser.ts](file:///d:/Haswanth/Coding/SplitWise/split/src/utils/csvParser.ts) containing initial anomaly classification rules and built the [ImportReviewTable.tsx](file:///d:/Haswanth/Coding/SplitWise/split/src/components/ImportReviewTable.tsx) visual component for review.

### 🔄 Prompt 2 — Bug: Settlement Logic Direction Reversed
> *"I found a bug in settlements. Your comment says 'paid_by loses, paid_to gains' but the code adds to paid_by and subtracts from paid_to."*

* **Outcome:** Triggered a logical audit of [simplification.ts](file:///d:/Haswanth/Coding/SplitWise/split/src/utils/simplification.ts). Verified mathematical correctness and corrected the misleading code comment to avoid future developer confusion.

### 📝 Prompt 3 — Draft Expense for Unknown Payers
> *"If someone who moved out still owes expenses dated after they left? Or missing payer — import as Draft Expense, exclude from balances."*

* **Outcome:** Prompted the addition of a "Draft Expense" state. Designed schema adjustments (making `paid_by` nullable, adding `is_draft` flag) and updated database migrations and calculations accordingly.

---

## ⚠️ Post-Mortem: Three Cases Where the AI Was Wrong

Here we outline critical bugs introduced by the AI co-pilot, how they were detected, and the fixes applied to ensure financial integrity.

### ❌ Case 1: Settlement Direction Comment Contradiction

* **The AI's Mistake:**
  In [simplification.ts](file:///d:/Haswanth/Coding/SplitWise/split/src/utils/simplification.ts), the AI added comments that contradicted the math:
  ```typescript
  // From settlements: paid_by loses, paid_to gains
  for (const s of settlements) {
    netMap[s.paid_by] = (netMap[s.paid_by] || 0) + s.amount  // Adding to paid_by
    netMap[s.paid_to] = (netMap[s.paid_to] || 0) - s.amount  // Subtracting from paid_to
  }
  ```
  The comment read "paid_by loses" but the code added money (`+`) to `paid_by`.

* **How It Was Caught:**
  Manual review of the balance transfer logic: when Rohan pays Aisha ₹5000, Rohan's net balance should increase (debts settled = more positive), and Aisha's outstanding credit decreases. The math was right, but the comment would mislead developers maintaining the code.

* **The Resolution:**
  Clarified the comments to explicitly reflect the mathematics:
  ```typescript
  // Settlement reduces debtor's debt (+) and reduces creditor's credit (-)
  ```

---

### ❌ Case 2: Silent Data Corruption on Retry (Non-Idempotency)

* **The AI's Mistake:**
  The initial `handleImport` implementation did a naive insert of every row without checking if a row already existed. If the import failed midway and the user fixed the issue and retried, the previously imported rows were duplicated, inflating balances exponentially.
  
  *Example:* Aisha's balance inflated from ~₹94,000 to ~₹324,000 after three retries.

* **How It Was Caught:**
  Noticed that the dashboard balances did not match the expected CSV totals. A quick DB count query showed identical rows inserted multiple times.

* **The Resolution:**
  Added unique constraint check (fingerprint checks) using a combination of fields:
  ```typescript
  const existingRes = await supabase.from('expenses').select('date, description, amount, paid_by').eq('group_id', id);
  const fingerprintSet = new Set(existingExpenses.map(e => `${e.date}|${e.description}|${e.amount}|${e.paid_by}`));
  
  // ... in parsing loop:
  if (fingerprintSet.has(fp)) { continue; } // Skip duplicates
  ```

---

### ❌ Case 3: Split Math Defaulted to Equal (Ignoring Shares & Exact Splits)

* **The AI's Mistake:**
  For CSV rows with `split_type = 'shares'` or `split_type = 'exact'`, the parser was computing shares as:
  ```typescript
  owed_share: row.amount / splitParticipants.length
  ```
  This treated all non-percentage splits as equal, ignoring custom ratios.

* **How It Was Caught:**
  *April Rent* (₹48,000 with shares `Aisha 2; Rohan 1; Priya 1`) split equally (₹16,000 each) instead of using the ratio (Aisha: ₹24k, Rohan: ₹12k, Priya: ₹12k).
  *Birthday Cake* (₹1,500 unequal split) did not respect exact values.

* **The Resolution:**
  Implemented split logic handling for all specific modes:
  ```typescript
  if (stype === 'shares' && totalShares > 0) {
    s.owed_share = Math.round((finalAmount * shareMap[s.user_id]) / totalShares * 100) / 100;
  } else if (stype === 'exact') {
    s.owed_share = shareMap[s.user_id];
  }
  ```
