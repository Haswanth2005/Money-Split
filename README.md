# 💸 SplitWise — Group Expense Tracker

A full-featured, high-performance group expense splitting application built with **React**, **TypeScript**, and **Supabase**. Track shared expenses, split costs in multiple customizable ways, settle debts easily, and import expense history directly from CSV files with a robust validation engine.

---

## ✨ Features

- **👥 Group Management** — Create custom groups for flatmates, trips, couples, and project teams.
- **🍕 Flexible Expense Splitting** — Split equally, by percentage, by exact amount, or by share ratio.
- **💱 Multi-Currency Support** — Smart automatic conversion (e.g., USD to INR) on import with auditable exchange rates.
- **📥 Robust CSV Import Wizard** — Ingest logs using a 5-step validation and cleaning pipeline with live error review.
- **⚡ Real-Time Balance Simplification** — Custom greedy transaction minimizer algorithm (reduces payments dynamically).
- **🔒 Secure Transactions & UPI** — QR code generation and quick settlement tracking.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 18 + TypeScript + Vite | Modern UI, Type-safety, Fast Dev Builds |
| **Styling** | Vanilla CSS | Bespoke, premium glassmorphism styling |
| **Database** | Supabase (PostgreSQL) | Relational constraints, real-time sync, RLS |
| **Auth** | Supabase Auth | Secure user sign-in and session management |
| **CSV Parsing** | PapaParse | Fast, browser-based stream parsing |
| **Date Handling** | date-fns | Lightweight, modular date calculations |
| **State** | TanStack Query | Cached server-state and query synchronization |

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- A free [Supabase](https://supabase.com) Account

### 1. Clone & Navigate
```bash
git clone <your-repo-url>
cd SplitWise/split
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Supabase Database
1. Create a new project on your [Supabase Dashboard](https://database.new).
2. Open the **SQL Editor** in the sidebar.
3. Open [supabase/schema.sql](file:///d:/Haswanth/Coding/SplitWise/split/supabase/schema.sql), copy its contents, and run the query to set up tables, RLS policies, and triggers.

### 4. Configure Environment Variables
Create a new file named `.env` in the `split/` directory:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
> [!NOTE]
> Find your project's URL and anon key under **Project Settings → API** in your Supabase dashboard.

### 5. Seed Demo Users (Optional)
To populate your environment with demo members (`Aisha`, `Rohan`, `Priya`, `Meera`, `Dev`, `Sam`) for testing:
```bash
node seedUsers.js
```

### 6. Run the Application
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📂 Project Structure

```bash
split/
├── src/
│   ├── pages/
│   │   ├── ImportCSV.tsx       # CSV import wizard with anomaly review
│   │   ├── GroupDetail.tsx     # Main group dashboard and balance overview
│   │   ├── ExpenseEdit.tsx     # Create, edit, and delete expenses
│   │   └── RecordSettlement.tsx # Record payment settlement (UPI / Cash)
│   ├── utils/
│   │   ├── csvParser.ts        # Fault-tolerant CSV parsing & anomaly rules
│   │   └── simplification.ts   # Greedy min-transaction settlement logic
│   ├── components/
│   │   └── ImportReviewTable.tsx # Interactive correction UI for CSV validation
│   └── types/
│       └── index.ts            # Common TypeScript type definitions
├── supabase/
│   └── schema.sql              # Supabase PostgreSQL DDL schema
└── README.md
```

---

## 📊 Importing Expenses

The CSV importer (`/groups/:id/import`) accepts files matching the following headers:
```csv
date, description, paid_by, amount, currency, split_type, split_with, split_details, notes
```

> [!TIP]
> The importer detects and handles **12+ data anomalies** automatically (such as missing values, formatting differences, negative refunds, and duplicates) to protect your financial records. Check [SCOPE.md](file:///d:/Haswanth/Coding/SplitWise/split/SCOPE.md) for more details.

---

## 🤖 AI Co-Pilot Log

This project was built with the assistance of **Google Gemini / Antigravity IDE** (an AI-powered coding assistant). The AI helped with:
- **Scaffolding React Components** — Creating pages, buttons, forms, and validation review grids.
- **CSV Parsing & Anomaly Logic** — Writing robust PapaParse routines and the 12+ anomaly detection checks in [csvParser.ts](file:///d:/Haswanth/Coding/SplitWise/split/src/utils/csvParser.ts).
- **Debt Simplification Algorithm** — Implementing the greedy transaction minimizer algorithm in [simplification.ts](file:///d:/Haswanth/Coding/SplitWise/split/src/utils/simplification.ts).
- **Debugging & Audit Fixes** — Fixing balance rounding issues, import idempotency duplicates, and comment direction bugs.

For a detailed post-mortem and prompt logs, see [AI_USAGE.md](file:///d:/Haswanth/Coding/SplitWise/split/AI_USAGE.md).
