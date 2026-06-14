# 🏛️ Architecture & Design Decisions

This document records the key architectural and design decisions made during the development of the **Money Split App CSV Importer**, outlining alternatives considered and the reasoning behind each choice.

---

## 📂 Decisions

### 1. Database Selection

* **Problem:** Storing users, groups, expenses, splits, and settlements, all of which exhibit tight, relational bonds.
* **Options Considered:**
  * **Option A: MongoDB**
    * *Pros:* Schema flexibility, easy document structures, fast JSON storage.
    * *Cons:* Requires embedding or complex manual references; non-trivial joins for computing live net balances/settlements; difficult to enforce strict referential integrity.
  * **Option B: PostgreSQL (Supabase)**
    * *Pros:* Relational model maps directly to the domain; native support for foreign key constraints, index tuning, joins, and ACID transactions.
    * *Cons:* Pre-defined schema designs required.
* **Decision:** **Option B (PostgreSQL through Supabase)**
* **Reasoning:** Financial records are relational in nature. Strict constraints and referential integrity prevent orphan splits or orphaned transactions, ensuring ledger balance correctness.

---

### 2. CSV Ingestion Workflow

* **Problem:** Raw CSV data is historically prone to formatting errors, missing information, and duplicates.
* **Options Considered:**
  * **Option A: Direct Database Import**
    * *Pros:* Direct database uploads are fast to implement.
    * *Cons:* Leads to incorrect balance projections, import crashes, or silent data corruption.
  * **Option B: Validation & Staging Pipeline**
    * *Pros:* Highlights anomalies beforehand, validates formats, allows interactive user revisions.
    * *Cons:* Requires more frontend components and parse steps.
* **Decision:** **Option B (Validation Pipeline)**
* **Reasoning:** In financial contexts, accuracy outweighs convenience. The pipeline parses, normalizes, validates, reviews, imports, and recalculates in stages.

---

### 3. Handling Missing Payers

* **Problem:** Incomplete CSV logs sometimes leave the payer field empty.
* **Options Considered:**
  * **Option A: Reject/Discard Row**
    * *Pros:* Prevents bad schema states.
    * *Cons:* Blocks the entire document upload.
  * **Option B: Auto-Assign Random Active Member**
    * *Pros:* Avoids schema blocks.
    * *Cons:* Distorts ledger balances.
  * **Option C: Import as "Draft" Expense**
    * *Pros:* Keeps records while excluding them from balance math until fixed.
    * *Cons:* Requires an explicit UI review workflow.
* **Decision:** **Option C (Import as Draft)**
* **Reasoning:** Preserves original records. Making `paid_by` nullable and introducing `is_draft = true` isolates the bad transaction until a group member assigns a payer.

---

### 4. Handling Duplicate Expenses

* **Problem:** Multiple rows in exports can represent duplicate clicks or double entries.
* **Options Considered:**
  * **Option A: Auto-Deduplication (Silent Deletion)**
    * *Pros:* Streamlines imports without prompting the user.
    * *Cons:* High risk of deleting legitimate distinct expenses of the same amount.
  * **Option B: Flag & Prompt Confirmation**
    * *Pros:* Puts the user in control; zero risk of accidental data loss.
    * *Cons:* Requires a review UI.
* **Decision:** **Option B (Interactive Review UI)**
* **Reasoning:** Transactions should never be permanently discarded without user approval.

---

### 5. Settlement vs. Expense Detection

* **Problem:** Some rows in expense exports represent interpersonal repayments rather than actual shared purchases (e.g., *"Rohan paid Aisha back"*).
* **Options Considered:**
  * **Option A: Treat as Standard Expense**
    * *Pros:* Simple database ingestion.
    * *Cons:* Artificially inflates overall group spending.
  * **Option B: Convert to Settlement Record**
    * *Pros:* Aligns with real-world intent; simplifies balances.
    * *Cons:* Demands keyword/semantic parsing.
* **Decision:** **Option B (Convert to Settlement)**
* **Reasoning:** Repayments reduce active debts and should never be logged under group purchases.

---

### 6. Handling Negative Amounts (Refunds)

* **Problem:** Refund entries are stored as negative numbers in CSV files.
* **Options Considered:**
  * **Option A: Disallow Negative Values**
    * *Pros:* Simpler schema constraints.
    * *Cons:* Excludes legitimate refunds (e.g., deposit returns, cancellations).
  * **Option B: Treat as Refund Adjustment**
    * *Pros:* Accurately models real events.
    * *Cons:* Requires balance adjustments during split calculation.
* **Decision:** **Option B (Refund Adjustment)**
* **Reasoning:** Negative amounts deduct from active outstanding balances, restoring correct shares.

---

### 7. Multi-Currency Tracking

* **Problem:** Shared trips or remote groups often mix currencies (e.g., INR and USD).
* **Options Considered:**
  * **Option A: Store Only Converted Values**
    * *Pros:* Streamlined single-currency databases.
    * *Cons:* Auditing original currency tags becomes impossible.
  * **Option B: Dual Amount Tracking**
    * *Pros:* Preserves history, allows auditing.
    * *Cons:* Requires tracking exchange rates.
* **Decision:** **Option B (Dual Amount Tracking)**
* **Reasoning:** Storing `original_amount`, `original_currency`, `exchange_rate`, and `converted_amount` ensures full auditability.

---

### 8. Date Normalization

* **Problem:** Inconsistent date strings (e.g., `2026-02-05`, `01/03/2026`, `Mar 14`) in CSV imports.
* **Options Considered:**
  * **Option A: Throw Parse Errors on Ambiguity**
    * *Pros:* Extremely strict dates.
    * *Cons:* Degrades user experience.
  * **Option B: Normalize with Smart Assumptions & Confirmations**
    * *Pros:* Automatically resolves standard formats, flags ambiguous dates (e.g., `04/05/2026` -> April 5 or May 4) for user selection.
* **Decision:** **Option B (Smart Normalization)**
* **Reasoning:** Chronological accuracy is critical for group ledger timelines.

---

### 9. Member Name Normalization

* **Problem:** CSV files often spell names inconsistently (`Priya`, `priya`, `Priya S`, `rohan`).
* **Options Considered:**
  * **Option A: Create New Users for Each Variation**
    * *Pros:* Simple insert workflow.
    * *Cons:* Balances get fragmented across fake user profiles.
  * **Option B: Interactive Alias Resolution**
    * *Pros:* Maps variations to existing group members.
    * *Cons:* Requires a mapping screen.
* **Decision:** **Option B (Alias Resolution)**
* **Reasoning:** Prevents duplicate accounts and correctly groups transaction history.

---

### 10. Balance Computation

* **Problem:** Tracking active outstanding balances between group members.
* **Options Considered:**
  * **Option A: Store Pairwise Debts Permanently**
    * *Pros:* Fast reads.
    * *Cons:* Redundant data storage; hard to maintain consistency on edits.
  * **Option B: Compute Net Balances Dynamically**
    * *Pros:* Lightweight database; single source of truth.
    * *Cons:* Requires real-time query computation.
* **Decision:** **Option B (Dynamic Computation)**
* **Reasoning:** Balances are derived views and should be calculated dynamically from active splits and settlements.

---

### 11. Transaction Minimization (Simplification)

* **Problem:** Raw debts require too many individual repayments to clear.
* **Options Considered:**
  * **Option A: Leave Debts as Pairwise Splits**
    * *Pros:* Matches precise transaction origins.
    * *Cons:* Inefficient; multiple small transfers required.
  * **Option B: Greedily Simplify Settlements**
    * *Pros:* Minimizes transactions; much better user experience.
    * *Cons:* Requires a creditor-debtor matching algorithm.
* **Decision:** **Option B (Greedy Minimization)**
* **Reasoning:** Users prefer settling debts with the minimum number of transactions.

---

### 12. Idempotency & Import Session Tracking

* **Problem:** Partial database failures or multiple clicks on the import button lead to duplicate data.
* **Options Considered:**
  * **Option A: Rely on User Caution**
    * *Pros:* No extra implementation.
    * *Cons:* High chance of balance corruption.
  * **Option B: Track Import Sessions & Row Fingerprints**
    * *Pros:* Safe, repeatable, and idempotent imports.
    * *Cons:* Requires session tracking structures.
* **Decision:** **Option B (Idempotent Imports)**
* **Reasoning:** Ensures that reloading or retrying an import does not duplicate records.

---

## 🎯 Guiding Principles

1. **Verify, Don't Guess:** Never guess financial numbers or payers.
2. **Graceful Failures:** Never crash on corrupt logs; extract valid parts and flag issues.
3. **Auditability:** Retain original amounts, rates, and date formats.
4. **Idempotency:** Re-running imports must yield identical ledger states.
5. **Simplicity:** Keep the total number of transactions to settle debts as low as possible.
