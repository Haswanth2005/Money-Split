# 🔍 Project Scope & CSV Anomaly Engine

This document defines the functional boundaries of the **Fault-Tolerant CSV Importer** and outlines how the ingestion pipeline handles irregular data.

The importer is built to be resilient: it detects anomalies, exposes issues for active user correction, and processes valid data structures without ever silently corrupting financial logs.

---

## 🛠️ CSV Anomaly Log & Resolution Rules

### 1. Duplicate Expense Entries
* **Description:** Identical or near-identical records submitted consecutively in the CSV.
* **Example:**
  * `Dinner at Marina Bites` vs `dinner - marina bites` (same day, same amount).
* **Detection Logic:** Same date, same payer, same amount, and fuzzy-matching descriptions.
* **Handling Policy:** Flags the row, prompting the user to choose: **Keep First**, **Keep Second**, or **Keep Both**. For this session, duplicates were ignored.

---

### 2. Conflicting Duplicate Expenses
* **Description:** Similar purchases logged on the same day but with differing amounts or payers.
* **Example:**
  * `Dinner at Thalassa` (₹2,400 by Aisha) vs `Thalassa dinner` (₹2,450 by Rohan).
* **Detection Logic:** Matching dates, similar description strings, but non-matching amounts/payers.
* **Handling Policy:** Marks as "Needs Review" and prompts manual selection. Here, only the first record was preserved.

---

### 3. Missing Payer
* **Description:** Expense row contains active members but leaves the payer field blank.
* **Example:**
  * `House cleaning supplies` (Payer column left empty).
* **Detection Logic:** `paid_by` is null or missing.
* **Handling Policy:** Imported as a **Draft Expense** (`paid_by = NULL`, `is_draft = true`). Drafts are excluded from outstanding balances until resolved in the UI.

---

### 4. Settlement Disguised as Expense
* **Description:** Repayments between group members logged as expenses.
* **Example:**
  * `Rohan paid Aisha back` (₹5,000).
* **Detection Logic:** Description contains keywords: `paid back`, `settled`, `repaid`, `transfer`, `repayment`.
* **Handling Policy:** Intercepted and written to the `settlements` ledger instead of `expenses`.

---

### 5. Deposit Recorded as Expense
* **Description:** Security deposits or sign-on fees incorrectly categorized.
* **Example:**
  * `Sam deposit share` (₹15,000).
* **Detection Logic:** Description or notes match keywords: `deposit share`, `moving in`, `security deposit`.
* **Handling Policy:** Logged as a `settlement` from Sam to Aisha; excluded from standard group expense pools.

---

### 6. Negative Amounts (Refunds)
* **Description:** Negative entries indicating cash-backs or returns.
* **Example:**
  * `Parasailing refund` (-$30 USD).
* **Detection Logic:** `amount < 0`.
* **Handling Policy:** Ingested as a Refund Adjustment. Negative values decrease the user's active outstanding balance.

---

### 7. Missing Currency
* **Description:** An expense is logged without currency denomination details.
* **Example:**
  * `Groceries DMart` (₹2,105, currency field blank).
* **Detection Logic:** `currency` is empty or null.
* **Handling Policy:** Suggests the group's default currency (typically `INR`), allowing override in review.

---

### 8. Multi-Currency Transactions
* **Description:** File mixes different currencies (USD, EUR, INR) within the same log sheet.
* **Example:**
  * Flatmates sharing expenses across countries.
* **Detection Logic:** Column values mismatch default group currency.
* **Handling Policy:** Converts amounts to the base currency (e.g., USD to INR at `1 USD ≈ ₹83.50`) while preserving both original and converted sums.

---

### 9. Inconsistent Date Formats
* **Description:** Dates presented in conflicting styles.
* **Example:**
  * `2026-02-05`, `01/03/2026`, `Mar 14`, `04/05/2026`.
* **Detection Logic:** Regular expression date format evaluation.
* **Handling Policy:** Normalizes all entries to standard `YYYY-MM-DD` ISO format.

---

### 10. Name Variations / spelling
* **Description:** Inconsistent member name spellings.
* **Example:**
  * `Priya`, `priya`, `Priya S`, `rohan`.
* **Detection Logic:** Case-insensitive comparison and string distance metrics.
* **Handling Policy:** Maps aliases to existing system user accounts (e.g., `Priya S` -> `Priya`).

---

### 11. Former Member Inclusions
* **Description:** Logging an expense including someone who has already left the group.
* **Example:**
  * `Groceries BigBasket` includes `Meera` after her recorded departure date.
* **Detection Logic:** Expense date > member's `left_at` date.
* **Handling Policy:** Warns the user, offering options to keep or remove them from the split.

---

### 12. Percentage Split Mismatches
* **Description:** Expense split percentages do not add up to exactly 100%.
* **Example:**
  * `Pizza Friday` splits: 30%, 30%, 30%, 20% (Total = 110%).
* **Detection Logic:** Sum of split percentages != 100.
* **Handling Policy:** Flags the row for user adjustment or even-redistribution.

---

### 13. Share split math
* **Description:** Ratios used to determine payment splits.
* **Example:**
  * `April Rent` (₹48,000, shares: Aisha 2, Rohan 1, Priya 1).
* **Handling Policy:**
  * $\text{Unit Value} = \frac{\text{Amount}}{\text{Total Shares}}$
  * $\text{Owed} = \text{Unit Value} \times \text{User Shares}$
  * Result: Aisha ₹24,000 | Rohan ₹12,000 | Priya ₹12,000.

---

### 14. Unequal Split Discrepancies
* **Description:** Custom exact splits don't sum to the total expense amount.
* **Example:**
  * `Birthday cake` (₹1,500 total, splits sum to ₹1,400).
* **Detection Logic:** Sum of split shares != total amount.
* **Handling Policy:** Flagged for manual correction.

---

### 15. Decimal Precision Errors
* **Description:** Floating point representation limits.
* **Example:**
  * Gas refill cost: `₹899.995`.
* **Handling Policy:** Renders the transaction after rounding values to two decimal places (e.g., `₹900.00`).

---

## 🗃️ Database Schema Blueprint

```sql
-- Core user profiles
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expense groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Member association table
CREATE TABLE group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);

-- Expense ledger
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  original_amount NUMERIC(12, 2),
  original_currency TEXT,
  exchange_rate NUMERIC(12, 6),
  paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
  split_type TEXT NOT NULL, -- 'equal', 'exact', 'percentage', 'shares'
  date DATE NOT NULL,
  notes TEXT,
  is_draft BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual shares for each expense
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owed_share NUMERIC(12, 2) NOT NULL,
  share_units NUMERIC(12, 4),
  UNIQUE (expense_id, user_id)
);

-- Repayment tracking
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID REFERENCES users(id) ON DELETE CASCADE,
  paid_to UUID REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'UPI',
  note TEXT,
  created_by UUID REFERENCES users(id)
);
```
