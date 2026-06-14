# 📄 CSV Import Report

This report summarizes the execution details, detected anomalies, user resolutions, and integrity checks performed during the ingestion session.

| Parameter | Details |
| :--- | :--- |
| **Source File** | `expenses_export.csv` |
| **Import Date** | June 14, 2026 |
| **Ingestion Engine** | V1.2.0-beta |
| **Final Status** | 🟡 Completed with Warnings |

---

## 📊 Ingestion Summary

- **Total Rows Processed:** 42
- **Successfully Ingested Expenses:** 36
- **Settlements Created:** 1
- **Refund Adjustments Applied:** 1
- **Draft Expenses Logged:** 1
- **Duplicate Rows Skipped:** 2
- **Rows Requiring Direct User Correction:** 3

---

## 🔍 Detailed Anomaly Log & Resolutions

### 1. Duplicate Expense Entry
* **Severity:** 🟡 Warning
* **Target Rows:**
  * `Dinner at Marina Bites`
  * `dinner - marina bites` (Identical date, amount, payer)
* **Resolution:** User selected **Keep First**. The second duplicate row was ignored.
* **Status:** ✅ Resolved

---

### 2. Conflicting Duplicate Expense
* **Severity:** 🟡 Warning
* **Target Rows:**
  * `Dinner at Thalassa` (₹2,400 by Aisha)
  * `Thalassa dinner` (₹2,450 by Rohan)
* **Resolution:** User selected **Keep First**. The second row was skipped.
* **Status:** ✅ Resolved

---

### 3. Missing Payer
* **Severity:** 🔴 High
* **Target Row:**
  * `House cleaning supplies` (₹780, payer field empty)
* **Resolution:** Imported into the database as a **Draft Expense** (`paid_by = NULL`, `is_draft = true`). It will remain isolated from balances until a payer is assigned.
* **Status:** ⚠️ Needs Review

---

### 4. Settlement Disguised as Expense
* **Severity:** 🟡 Warning
* **Target Row:**
  * `Rohan paid Aisha back` (₹5,000)
* **Resolution:** Parsed settlement keywords and imported the row directly into the `settlements` table (Rohan → Aisha: ₹5,000).
* **Status:** ✅ Resolved

---

### 5. Deposit Recorded as Expense
* **Severity:** 🟡 Warning
* **Target Row:**
  * `Sam deposit share` (₹15,000)
* **Resolution:** Extracted notes (*"Sam moving in! paid Aisha his deposit"*) and mapped as a `settlement` from Sam to Aisha.
* **Status:** ✅ Resolved

---

### 6. Negative Amount (Refund)
* **Severity:** 🟢 Information
* **Target Row:**
  * `Parasailing refund` (-$30 USD)
* **Resolution:** Imported as a Refund Adjustment, reducing members' outstanding balances accordingly.
* **Status:** ✅ Resolved

---

### 7. Missing Currency
* **Severity:** 🟡 Warning
* **Target Row:**
  * `Groceries DMart` (₹2,105, currency field blank)
* **Resolution:** Resolved to group base currency: **INR**.
* **Status:** ✅ Resolved

---

### 8. Multi-Currency Conversions
* **Severity:** 🟢 Information
* **Detected Currencies:** `USD`, `INR`
* **Resolution:** Converted USD to INR at `1 USD = ₹83.50` while storing original details for auditing:
  * `$540 USD` → `₹45,090`
  * `$84 USD` → `₹7,014`
  * `$150 USD` → `₹12,525`
* **Status:** ✅ Resolved

---

### 9. Inconsistent Date Formats
* **Severity:** 🟢 Information
* **Detected Formats:** `YYYY-MM-DD`, `DD/MM/YYYY`, `MMM DD`
* **Resolution:** Normalized all records to `YYYY-MM-DD`.
* **Status:** ✅ Resolved

---

### 10. Ambiguous Date Format
* **Severity:** 🟡 Warning
* **Target Row:**
  * `04/05/2026` (Interpretation: April 5 vs May 4)
* **Resolution:** User verified date as **4 May 2026**.
* **Status:** ✅ Resolved

---

### 11. Name Inconsistencies
* **Severity:** 🟡 Warning
* **Detected Aliases:** `Priya`, `priya`, `Priya S`, `rohan`
* **Resolution:** Mapped names using alias lookup rules:
  * `priya` → `Priya`
  * `Priya S` → `Priya`
  * `rohan` → `Rohan`
* **Status:** ✅ Resolved

---

### 12. Former Member Inclusions
* **Severity:** 🟡 Warning
* **Target Row:**
  * `Groceries BigBasket` (Meera listed as split participant after her departure date)
* **Resolution:** User selected **Keep Meera** in this split.
* **Status:** ✅ Resolved

---

### 13. Percentage Split Validation
* **Severity:** 🟡 Warning
* **Target Row:**
  * `Pizza Friday` (Percentages verified)
* **Resolution:** Splits verified and validated: Aisha (30%), Rohan (30%), Priya (30%), Meera (20%).
* **Status:** ✅ Resolved

---

### 14. Share Split Calculation
* **Severity:** 🟢 Information
* **Target Row:**
  * `April Rent`
* **Resolution:** Applied share weights (Aisha: 2, Rohan: 1, Priya: 1). Calculated values:
  * Aisha: `₹24,000`
  * Rohan: `₹12,000`
  * Priya: `₹12,000`
* **Status:** ✅ Resolved

---

### 15. Decimal Precision
* **Severity:** 🟢 Information
* **Target Row:**
  * `Cylinder refill` (₹899.995)
* **Resolution:** Rounded to two decimal places: `₹900.00`.
* **Status:** ✅ Resolved

---

## ⚖️ Integrity Checklist

- **Ledger Balances Sum to Zero:** ✅ Passed
- **Double-Entry Prevention:** ✅ Passed
- **Duplicate Imports Check:** ✅ Passed
- **Draft Separation Verification:** ✅ Passed
- **Exchange Rate Veracity:** ✅ Passed

---

## 🏁 Final Ingestion Result

* **Total Expenses Imported:** 36
* **Total Settlements Created:** 1
* **Draft Expenses flagged:** 1

> [!WARNING]
> Ingestion is complete. However, **1 Draft Expense** requires manual assignment of a payer to reconcile remaining balances. Please head to the Group Dashboard to review.
