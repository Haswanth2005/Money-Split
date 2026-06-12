# Product Requirements Document
## SplitApp — Shared Expense Tracker MVP
**Version:** 1.1 · **Timeline:** 3 days · **Author:** Generated from discovery session

---

## Minimum Product Requirements

These are the non-negotiable requirements this build must satisfy:

1. **Login module** — email + password authentication with sign-up, login, and password reset
2. **Create and manage groups** — create groups, invite users (existing and new via email), add members post-creation, and remove members
3. **Create and manage expenses**
   - a. Split equally, unequally (exact amounts), by percentage, and by share
   - b. User chat on each expense with real-time updates (Supabase Realtime)
   - c. Group-wise balances and individual balance summary across all groups
   - d. Settle debts or record payments between members
4. **Relational DB only** — PostgreSQL via Supabase with full FK constraints and Row Level Security

---

## 1. Product Overview

### 1.1 What it is

SplitApp is a web-based shared expense tracker. It lets groups of people — flatmates splitting rent, or friends on a trip — log who paid for what, see who owes whom, and record settlements. The app keeps a running ledger so money conversations don't have to happen in person.

### 1.2 Primary goal

Make it frictionless to record shared expenses and surface a clean, always-accurate balance summary so every group member knows exactly where they stand at a glance.

### 1.3 Out-of-scope for this build

The following are explicitly excluded from the 3-day MVP:

- Receipt OCR / scanning
- Real payment gateway integrations (Stripe, Venmo, Razorpay, etc.)
- Multi-currency support (single currency only — INR)
- Push notifications or email reminders
- Activity / audit log feed
- Recurring expenses
- Mobile native apps (iOS / Android)
- CSV / transaction import
- Charts, graphs, or spending reports
- Admin roles or group permissions beyond basic membership

---

## 2. User Personas

### Persona A — The Flatmate
Priya lives with 3 others and uses the app day-to-day. She pays the electricity bill on the 5th of every month and wants the others to know what they owe her without a WhatsApp chase. She checks the app on her phone during commute.

**Key need:** See her current balance in 2 seconds. Add an expense in under 30 seconds.

### Persona B — The Trip Organiser
Arjun is managing finances for a 5-person Goa trip. He books the hotel and beach activities upfront, then splits them among friends. At the end of the trip, he wants a single "who owes whom" summary.

**Key need:** Multiple expenses in one group. Simplified settlement view at the end.

---

## 3. Core User Flows (MVP Must-Have)

These are the flows the app cannot ship without:

1. **Sign up / Log in** — email + password via Supabase Auth
2. **Create a group** — name it, set a type, add members by email (existing users added immediately; non-registered users receive an invite email)
3. **Invite / remove members** — group creator can invite new members post-creation and remove existing members (if their balance is zero)
4. **Add an expense** — description, amount, payer, split type, participants
5. **View group balances** — see simplified who-owes-whom for the group
6. **View individual balance summary** — per-user breakdown across all groups and bilateral debts
7. **Expense chat** — real-time comment thread on each expense
8. **Settle up** — record a payment that offsets a debt
9. **Edit / delete an expense**
10. **Leave or delete a group**

---

## 4. Target Devices & Responsiveness

**Fully responsive** — the app must work well on both mobile (375px+) and desktop (1280px+).

| Breakpoint | Behaviour |
|---|---|
| Mobile < 640px | Single-column layout. Bottom nav bar replaces sidebar. Cards stack full-width. |
| Tablet 640–1024px | Two-column layout possible. Sidebar collapses. |
| Desktop 1024px+ | Sidebar nav + main content area. Max content width 1200px. |

Touch targets: minimum 44px for all interactive controls.

---

## 5. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite (TypeScript) | Fast dev server, lightweight SPA, familiar to Haswanth's stack |
| Auth | Supabase Auth | Email + password OOTB, JWT handled, no custom auth logic needed |
| Database | Supabase (PostgreSQL) | Managed Postgres, row-level security, relational schema with FK constraints |
| Real-time | Supabase Realtime | Postgres-backed broadcast for expense chat — no extra infra needed |
| Hosting | Vercel | Zero-config deploy, free tier, env vars handled cleanly |
| Styling | Tailwind CSS v3 | Utility-first, easy responsive, pairs well with design tokens from DESIGN.md |
| State | React Query (TanStack Query) | Server state, caching, optimistic updates |
| Forms | React Hook Form + Zod | Validation with type safety |
| Icons | Lucide React | Clean outline icons consistent with design system tone |

### 5.1 Supabase setup notes
- Use Supabase JS client v2 in the frontend
- Enable Row Level Security on all tables
- Auth: email + password only (disable OAuth for MVP)
- Storage: not needed in MVP

---

## 6. Data Model

### 6.1 Core entities

#### `users` (managed by Supabase Auth)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | From auth.users |
| email | text | Unique |
| full_name | text | Display name |
| avatar_url | text | Optional |
| created_at | timestamptz | |

#### `groups`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | Required |
| group_type | enum | 'home' \| 'trip' \| 'couple' \| 'other' |
| created_by | uuid FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `group_members`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| user_id | uuid FK → users | |
| joined_at | timestamptz | |
| UNIQUE | (group_id, user_id) | |

#### `expenses`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → groups | Nullable (for non-group expenses between two friends) |
| description | text | Required |
| amount | numeric(12, 2) | Required, positive |
| currency | text | Default 'INR' (fixed for MVP) |
| paid_by | uuid FK → users | Who actually paid |
| split_type | enum | 'equal' \| 'exact' \| 'percentage' \| 'shares' |
| date | date | Defaults to today |
| created_by | uuid FK → users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | Soft delete |

#### `expense_splits`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| expense_id | uuid FK → expenses | |
| user_id | uuid FK → users | |
| owed_share | numeric(12, 2) | How much this user owes for the expense |
| share_units | integer | For share-based splits only — the number of shares this user holds (nullable) |

#### `expense_comments`
Real-time chat thread attached to each expense. Powered by Supabase Realtime (Postgres changes broadcast).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| expense_id | uuid FK → expenses | |
| user_id | uuid FK → users | Author |
| content | text | Message body, max 1000 chars |
| created_at | timestamptz | |
| deleted_at | timestamptz | Soft delete — author can retract |

#### `group_invites`
Tracks pending email invitations for users who don't have an account yet.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| invited_by | uuid FK → users | |
| email | text | Invited email address |
| token | text | Unique secure token for the invite link |
| status | enum | 'pending' \| 'accepted' \| 'expired' |
| created_at | timestamptz | |
| expires_at | timestamptz | 7 days from creation |

#### `settlements`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → groups | Nullable |
| paid_by | uuid FK → users | Who is paying back |
| paid_to | uuid FK → users | Who is being paid |
| amount | numeric(12, 2) | |
| note | text | Optional |
| date | date | |
| created_by | uuid FK → users | |
| created_at | timestamptz | |

### 6.2 Balance calculation

Balances are computed at query time, not stored, to stay consistent:

```
net_balance(user_A, user_B) = 
  SUM(owed_share where user_id = A and paid_by = B, in active expenses)
  - SUM(owed_share where user_id = B and paid_by = A, in active expenses)
  + SUM(amount where paid_by = B and paid_to = A, in settlements)
  - SUM(amount where paid_by = A and paid_to = B, in settlements)
```

A positive result means A owes B. Negative means B owes A.

### 6.3 Currency

Single currency for MVP: **INR (₹)**. Currency column exists in schema to make future expansion trivial but the UI shows INR only and there is no conversion logic.

---

## 7. Authentication

### 7.1 Provider
Supabase Auth — email + password.

### 7.2 Flows
- **Sign up:** email, password (min 8 chars), full name. Supabase sends a confirmation email. On confirm, insert a row into `users` table via a Supabase database trigger.
- **Log in:** email + password. JWT stored in localStorage by Supabase client.
- **Log out:** Clear Supabase session.
- **Password reset:** Supabase's built-in "forgot password" email flow.

### 7.3 Route protection
All routes except `/login` and `/signup` require an active session. Unauthenticated users are redirected to `/login`.

---

## 8. Groups & Members

### 8.1 Creating a group
- User provides a name and group type
- Creator is automatically added as a member
- Members can be added at creation time by email:
  - If the email matches an existing registered user → added immediately as a member
  - If the email is not registered → a `group_invites` row is created and Supabase sends an invite email with a unique token link. On sign-up via that link, the user is auto-added to the group.

### 8.2 Post-creation: inviting members
- Group creator (or any member) can open "Invite" from the group settings at any time
- Same email-based flow as above — existing users added immediately, unregistered users get an invite email
- Pending invites are visible in group settings with a "Revoke" option

### 8.3 Removing members
- Any group member can be removed by the group creator
- A member cannot be removed while they have a non-zero balance in the group
- A member can remove themselves (leave) if their own balance is zero

### 8.3 Group types
`home` | `trip` | `couple` | `other` — affects the icon shown in the group list, nothing else in MVP.

---

## 9. Expenses & Splitting

### 9.1 Creating an expense
Fields:
- **Description** — required, free text
- **Amount** — required, numeric > 0, INR
- **Paid by** — required, one of the group members (defaults to the current user)
- **Split type** — required: Equal | Exact | Percentage
- **Participants** — which members are included in this split (defaults to all group members)
- **Date** — defaults to today, editable

### 9.2 Split types

#### Equal split
`owed_share` for each participant = `amount / count(participants)`. Remainder (from rounding) added to the payer's own share.

Example: ₹100 split 3 ways → ₹33.33, ₹33.33, ₹33.34 (last cent to payer).

#### Exact amounts
User manually enters each participant's `owed_share`. Sum must equal total expense amount. The UI shows a live validation: running total and how much is left to assign.

#### Percentage split
User enters a percentage for each participant. Percentages must sum to 100. `owed_share = (percentage / 100) * amount`. Floating-point remainder handled the same way as equal split.

#### Share-based split
User assigns a number of "shares" to each participant (e.g. 1, 2, 3). The expense is divided proportionally. `owed_share = (user_shares / total_shares) * amount`. The `share_units` column on `expense_splits` stores the raw share count; `owed_share` stores the resolved amount. Example: ₹600 split with A=1 share, B=2 shares, C=3 shares → A pays ₹100, B pays ₹200, C pays ₹300.

### 9.3 Single payer only
MVP supports exactly one payer per expense. Multi-payer splits are out of scope.

### 9.4 Editing expenses
Any group member can edit an expense. Editing recalculates all splits. The app does not track a full edit history in MVP — only the current state is stored.

### 9.5 Deleting expenses
Soft delete (`deleted_at` timestamp set). Expense disappears from the UI and is excluded from all balance calculations. Not permanently removed from the DB.

---

## 10. Expense Chat (Real-time)

### 10.1 Overview
Each expense has a comment thread visible to all group members. Comments are delivered in real-time using Supabase Realtime (Postgres changes on the `expense_comments` table broadcast to all subscribed clients in the group).

### 10.2 Behaviour
- Chat panel appears in the expense detail view, below the split breakdown
- Any group member can post a comment
- Comments show: author avatar (initials), author name, timestamp, message text
- New messages appear instantly for all members currently viewing the expense (no page refresh needed)
- Message author can soft-delete their own comment — it shows as "Message deleted" to others
- No edit support in MVP — delete and re-post if needed
- Max message length: 1000 characters
- No file attachments or emoji reactions in MVP

### 10.3 Real-time implementation
```
1. On expense detail page mount:
   supabase.channel('expense-chat-{expense_id}')
     .on('postgres_changes', {
       event: 'INSERT',
       schema: 'public',
       table: 'expense_comments',
       filter: `expense_id=eq.{expense_id}`
     }, (payload) => appendMessage(payload.new))
     .subscribe()

2. On unmount: unsubscribe the channel

3. Initial load: fetch all non-deleted comments for the expense ordered by created_at ASC
```

### 10.4 RLS policy for comments
- SELECT: user must be a member of the group the expense belongs to
- INSERT: user must be a member of the group
- UPDATE (soft delete): user can only update rows where `user_id = auth.uid()`

---

## 11. Settlements & Debt Simplification

### 11.1 Recording a settlement
Any group member can record a "Settle Up" payment:
- Who paid (paid_by)
- Who received (paid_to)
- Amount
- Optional note
- Date (defaults to today)

This creates a row in `settlements` and immediately adjusts the displayed balances.

### 11.2 Debt simplification algorithm

The "Simplified balances" view (shown by default for each group) computes the minimum number of transactions that would settle all debts in the group.

**Algorithm: Greedy min-transactions (net-flow approach)**

```
1. Compute each member's net balance across the group:
   net[u] = total_paid_by[u] - total_owed_by[u] + received_settlements[u] - paid_settlements[u]

2. Split members into two lists:
   creditors = [(user, +net)] sorted descending by amount
   debtors   = [(user, -net)] sorted descending by amount

3. While both lists are non-empty:
   a. Take the largest creditor (C) and largest debtor (D)
   b. payment = min(C.amount, D.amount)
   c. Record: D pays C the amount `payment`
   d. Subtract payment from both
   e. Remove any creditor/debtor whose balance has reached 0
```

This produces the minimum set of transactions needed to fully settle the group.

The **raw bilateral balances view** (toggle available) shows the un-simplified direct balances between each pair for transparency.

### 11.3 "Settle up" flow
From the group balances screen, each "D owes C ₹X" line has a "Settle" button. Clicking it pre-fills the settlement form with those parties and amount. User can adjust amount (e.g. partial settlement) before confirming.

---

## 12. Navigation & Information Architecture

```
/                              → Redirect to /dashboard if logged in, else /login
/login                         → Login page
/signup                        → Sign up page
/invite/:token                 → Accept group invite (sign up or log in, then join group)
/dashboard                     → Overview: individual balance summary + group list
/groups/new                    → Create group
/groups/:id                    → Group detail (expenses + balances tab)
/groups/:id/settings           → Group settings (invite members, remove members)
/groups/:id/expenses/new       → Add expense to group
/groups/:id/expenses/:eid      → Expense detail + chat thread
/groups/:id/expenses/:eid/edit → Edit expense
/groups/:id/settle             → Record a settlement within the group
/account                       → Profile settings (name, password change)
```

### 12.1 Dashboard
Three panels:
1. **You are owed** — total across all groups and bilateral debts
2. **You owe** — total across all groups and bilateral debts
3. **Recent groups** — last 5 active groups with their balance summary

### 12.2 Group detail tabs
- **Expenses** tab — chronological list of expenses; tap/click any expense to open detail + chat
- **Balances** tab — simplified debt graph; toggle for raw bilateral balances

---

## 13. Visual Design System

Based on `DESIGN.md` (Cursor design analysis). The app adopts this system directly.

### 13.1 Color tokens (mapped to Tailwind CSS variables)

```css
:root {
  --color-primary: #f54e00;         /* Cursor Orange — CTAs only */
  --color-primary-active: #d04200;
  --color-ink: #26251e;
  --color-body: #5a5852;
  --color-muted: #807d72;
  --color-muted-soft: #a09c92;
  --color-hairline: #e6e5e0;
  --color-hairline-soft: #efeee8;
  --color-hairline-strong: #cfcdc4;
  --color-canvas: #f7f7f4;          /* Page background — warm cream */
  --color-canvas-soft: #fafaf7;
  --color-surface-card: #ffffff;
  --color-surface-strong: #e6e5e0;
  --color-on-primary: #ffffff;
  --color-semantic-error: #cf2d56;
  --color-semantic-success: #1f8a65;
}
```

### 13.2 Typography

**Primary font:** Inter (open-source substitute for CursorGothic, weight 400/500/600).
**Monospace:** JetBrains Mono (for any numeric/amount displays where mono alignment helps).

```
Display (group names, page titles): 26px / weight 400 / letter-spacing -0.3px
Section headings:                   22px / weight 400 / letter-spacing -0.1px
Card titles:                        18px / weight 600
Body:                               16px / weight 400 / line-height 1.5
Body small:                         14px / weight 400
Caption / labels:                   13px / weight 400
Uppercase label:                    11px / weight 600 / letter-spacing 0.88px / uppercase
Buttons:                            14px / weight 500
```

### 13.3 Key design rules for implementation

- **Canvas is warm cream (#f7f7f4), never pure white.** Page background = `--color-canvas`.
- **Cards are pure white (#fff)** with a 1px `--color-hairline` border. No drop shadows anywhere.
- **Cursor Orange is used only for primary CTAs** — the "Add Expense", "Settle Up", and "Create Group" buttons. Nothing else uses this color.
- **Display weight is 400.** Headings are never bold — the negative letter-spacing carries the weight visually.
- **Positive balances** (you are owed): `--color-semantic-success` (#1f8a65) text.
- **Negative balances** (you owe): `--color-semantic-error` (#cf2d56) text.
- **Zero balances**: `--color-muted` (#807d72).
- Border radius: 8px for buttons and inputs, 12px for cards.
- Section spacing: 80px on desktop, 48px on mobile.
- All interactive elements: 44px touch target.

### 13.4 Component patterns

**Primary button (CTA):**
```
bg: #f54e00 | text: #fff | height: 40px | padding: 10px 18px | radius: 8px | weight: 500
Hover: bg #d04200
```

**Secondary button:**
```
bg: #ffffff | text: #26251e | border: 1px #cfcdc4 | height: 40px | radius: 8px
```

**Expense card:**
```
bg: #ffffff | border: 1px #e6e5e0 | radius: 12px | padding: 16px 20px
Left: description (body) + date (caption)
Right: amount (title-sm) + "You paid" or "Your share: ₹X" (caption, muted)
```

**Balance summary chip:**
```
Positive: bg #e8f5f0 | text #1f8a65 | radius 9999px | padding 4px 10px
Negative: bg #fceef2 | text #cf2d56 | radius 9999px | padding 4px 10px
Zero:     bg #e6e5e0 | text #807d72 | radius 9999px | padding 4px 10px
```

**Text input:**
```
bg: #ffffff | border: 1px #e6e5e0 | height: 44px | radius: 8px | padding: 12px 16px
Focus: border-color #f54e00 | outline none
```

---

## 14. Feature Priority Matrix

### Day 1 — Foundation
- [ ] Supabase project setup (Auth + DB schema + RLS policies)
- [ ] All 7 tables created with FK constraints and RLS
- [ ] React + Vite + TypeScript project scaffold
- [ ] Tailwind config with design tokens
- [ ] Auth pages: Login, Signup
- [ ] Invite token acceptance flow (`/invite/:token`)
- [ ] Protected route wrapper
- [ ] Dashboard shell layout (sidebar nav + main area)
- [ ] Groups list on dashboard

### Day 2 — Core Features
- [ ] Create group flow (with invite-by-email for existing + non-registered users)
- [ ] Group settings page (invite post-creation, remove members)
- [ ] Group detail page (members list, expenses tab, balances tab)
- [ ] Add expense — equal + exact + percentage splits
- [ ] Add expense — share-based split
- [ ] Edit / delete expense
- [ ] Balance calculation logic (raw bilateral)
- [ ] Debt simplification algorithm + "Simplified" toggle
- [ ] Individual balance summary on dashboard

### Day 3 — Chat + Settlements + Polish
- [ ] Expense detail page with chat thread
- [ ] Supabase Realtime subscription for live chat
- [ ] Settle up flow (record settlement, pre-fill from balance view)
- [ ] Fully responsive layout (mobile nav, breakpoints)
- [ ] Empty states (no groups, no expenses, zero balance, no messages)
- [ ] Form validation (Zod schemas, error messages)
- [ ] Loading states + optimistic UI (especially for chat send)
- [ ] Final visual polish pass (typography, spacing, color)
- [ ] Deploy to Vercel

---

## 15. Non-functional Requirements

| Requirement | Target |
|---|---|
| First Contentful Paint | < 2s on 4G |
| Largest Contentful Paint | < 3.5s |
| Balance calculation correctness | Must match expected output for test cases |
| WCAG AA compliance | Colour contrast, focus states, ARIA labels on all interactive elements |
| Session persistence | User stays logged in across browser refreshes |
| Offline behaviour | Show a graceful banner if network is lost; no data mutation while offline |

---

## 16. Test Cases for Balance Calculation

Before shipping, manually verify these scenarios:

**Scenario 1 — Equal 3-way split**
- Group: A, B, C
- A pays ₹300 for dinner, split equally
- Expected: B owes A ₹100, C owes A ₹100

**Scenario 2 — Percentage split**
- A pays ₹1000 for hotel, B gets 60%, C gets 40%
- Expected: B owes A ₹600, C owes A ₹400

**Scenario 3 — Partial settlement**
- B owes A ₹100 (from Scenario 1)
- B pays A ₹60 (settlement recorded)
- Expected: B still owes A ₹40

**Scenario 4 — Debt simplification**
- Group: A, B, C
- A pays ₹100 split equally (B owes A ₹33, C owes A ₹33)
- B pays ₹60 split equally (A owes B ₹20, C owes B ₹20)
- Simplified: C owes A ₹13, C owes B ₹20, A owes B... (verify algorithm output)

**Scenario 5 — Zero balance after settlement**
- After full settlement, all balances show ₹0

---

## 17. Open Questions / Decisions Deferred

| Question | Status |
|---|---|
| Can users add expenses outside of any group (bilateral only)? | Deferred — MVP focuses on group expenses only |
| Profile picture upload | Out of scope, initials avatar only |
| What happens to the group when creator leaves? | Creator cannot leave unless they transfer ownership — defer ownership transfer to v2 |
| Real-time balance updates (Supabase Realtime) | In scope for chat only. Balance figures refresh on navigation/tab switch; live balance streaming deferred to v2 |

---

*Document generated from product discovery session. Ready to begin implementation.*