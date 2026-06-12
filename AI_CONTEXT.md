# AI Context: SplitApp — Shared Expense Tracker MVP

This document is the single source of truth for the SplitApp Shared Expense Tracker MVP. The entire application (database schema, backend configuration, routing, frontend components, and styling) can be built deterministically from the specifications detailed below.

---

## 1. Product Goals & Personas

### 1.1 Goals
*   **Frictionless Splitting:** Allow groups (roommates, travel companions, friends) to track expenses in one currency (**INR (₹)**) without manual calculations or spreadsheets.
*   **Aesthetic Distinction:** Implement a premium, minimal, editorial interface inspired by Cursor's marketing site (warm cream canvas, clean ink text, minimal 1px hairlines, and scarce Cursor Orange CTAs).
*   **Real-Time Collaboration:** Real-time chat on each expense to discuss splits directly inside the context of the bill.

### 1.2 Target Personas
*   **The Flatmate:** Priya lives with roommates. She pays monthly bills (electricity, internet) and wants roommates to settle up without social friction. Checks balance on mobile.
*   **The Trip Organizer:** Arjun manages Goa trip finances for 5 friends. He pays hotels/activities upfront and wants a single "who owes whom" summary at the end.

---

## 2. Scope & Boundaries

### 2.1 In-Scope (MVP Core)
1.  **Auth:** Email + password authentication (sign-up, login, logout, password reset) via Supabase Auth.
2.  **Groups:** Create groups, invite members by email (existing users join immediately; non-registered users get pending invite token links), add members post-creation, remove members (only if balance is zero), and leave groups (only if balance is zero).
3.  **Expenses:** Create, edit, and soft-delete group expenses.
4.  **Splitting Types:** Equal, exact amounts, percentage splits, and share-based splits. Single payer only per expense.
5.  **Expense Chat:** Real-time user comments on specific expenses using Supabase Realtime.
6.  **Settlements:** Record bilateral payments ("A paid B ₹X") directly inside groups to offset debt.
7.  **Balances:** Group-wise balance summary (who owes whom) with toggle between **Greedy Min-Transactions (Debt Simplification)** and **Raw Bilateral Balances**.
8.  **Dashboard:** Individual balance summary showing total amount user owes / is owed across all groups, plus active groups list.

### 2.2 Out-of-Scope
*   Multi-currency (App is locked to INR `₹`).
*   Receipt scanning / OCR.
*   Direct payment integrations (Stripe, Venmo, UPI links, etc.).
*   Recurring expenses or spending category charts.
*   Auditing logs, push notifications, and user avatar image uploads (uses initials).

---

## 3. Technology Stack

*   **Frontend:** React (TypeScript) + Vite
*   **Styling:** Tailwind CSS v3 (using customized CSS variables based on `DESIGN.md`)
*   **Auth & Backend Database:** Supabase (PostgreSQL with Row Level Security enabled)
*   **Real-time Features:** Supabase Realtime (broadcast changes to comment threads)
*   **State Management:** React Query (TanStack Query v4/v5)
*   **Form Handling:** React Hook Form + Zod
*   **Icons:** Lucide React
*   **Hosting:** Vercel (Frontend)

---

## 4. Relational Database Schema & Policies

All tables are in the `public` schema in PostgreSQL. Row Level Security (RLS) is enabled on all tables.

### 4.1 SQL Schema Definition

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Profile (Linked to auth.users via trigger)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Groups
create type group_category as enum ('home', 'trip', 'couple', 'other');

create table public.groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  group_type group_category default 'other'::group_category not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Group Members
create table public.group_members (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (group_id, user_id)
);

-- 4. Expenses
create type split_mechanism as enum ('equal', 'exact', 'percentage', 'shares');

create table public.expenses (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null, -- Group context required for MVP
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text default 'INR'::text not null,
  paid_by uuid references public.users(id) on delete restrict not null,
  split_type split_mechanism default 'equal'::split_mechanism not null,
  date date default current_date not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone -- Null when active, timestamp when soft-deleted
);

-- 5. Expense Splits
create table public.expense_splits (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references public.expenses(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  owed_share numeric(12, 2) not null check (owed_share >= 0),
  share_units integer check (share_units >= 0), -- Stored only for share splits
  unique (expense_id, user_id)
);

-- 6. Expense Comments (Real-time chat)
create table public.expense_comments (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references public.expenses(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  content text not null check (char_length(content) <= 1000),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone -- Soft delete for messages
);

-- 7. Group Invites (Unregistered Users)
create type invite_status as enum ('pending', 'accepted', 'expired');

create table public.group_invites (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  invited_by uuid references public.users(id) on delete cascade not null,
  email text not null,
  token text not null unique,
  status invite_status default 'pending'::invite_status not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone not null
);

-- 8. Settlements
create table public.settlements (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  paid_by uuid references public.users(id) on delete restrict not null, -- Debtor paying
  paid_to uuid references public.users(id) on delete restrict not null, -- Creditor receiving
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  date date default current_date not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

### 4.2 Database Triggers
When a user signs up through Supabase Auth, they are created in the `auth.users` schema. We automatically sync them to the `public.users` profile table.

```sql
-- Trigger to sync auth.users to public.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4.3 Row Level Security (RLS) Policies
RLS must ensure that users can only read or write data inside groups they are active members of.

```sql
-- Helper function to check group membership
create or replace function public.is_group_member(group_uuid uuid, user_uuid uuid)
returns boolean security definer as $$
begin
  return exists (
    select 1 from public.group_members
    where group_id = group_uuid and user_id = user_uuid
  );
end;
$$ language plpgsql;

-- 1. Users policies
alter table public.users enable row level security;
create policy "Users are viewable by group members or self" on public.users
  for select using (
    id = auth.uid() or 
    exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = public.users.id
    )
  );
create policy "Users can update their own profile" on public.users
  for update using (id = auth.uid());

-- 2. Groups policies
alter table public.groups enable row level security;
create policy "Groups are viewable by members" on public.groups
  for select using (public.is_group_member(id, auth.uid()));
create policy "Anyone authenticated can create groups" on public.groups
  for insert with check (auth.uid() is not null);
create policy "Creator can update group details" on public.groups
  for update using (created_by = auth.uid());

-- 3. Group Members policies
alter table public.group_members enable row level security;
create policy "Members are viewable by fellow group members" on public.group_members
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "Members can join a group" on public.group_members
  for insert with check (auth.uid() is not null); -- Logic enforced on invite acceptance
create policy "Members can leave or creator can kick" on public.group_members
  for delete using (user_id = auth.uid() or exists (
    select 1 from public.groups where id = group_id and created_by = auth.uid()
  ));

-- 4. Expenses policies
alter table public.expenses enable row level security;
create policy "Expenses are viewable by group members" on public.expenses
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "Group members can insert expenses" on public.expenses
  for insert with check (public.is_group_member(group_id, auth.uid()));
create policy "Group members can update expenses" on public.expenses
  for update using (public.is_group_member(group_id, auth.uid()));

-- 5. Splits policies
alter table public.expense_splits enable row level security;
create policy "Splits are viewable by group members" on public.expense_splits
  for select using (
    exists (
      select 1 from public.expenses e 
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );
create policy "Group members can insert/edit splits" on public.expense_splits
  for all using (
    exists (
      select 1 from public.expenses e 
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

-- 6. Comments policies
alter table public.expense_comments enable row level security;
create policy "Comments are viewable by group members" on public.expense_comments
  for select using (
    exists (
      select 1 from public.expenses e 
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );
create policy "Group members can post comments" on public.expense_comments
  for insert with check (
    user_id = auth.uid() and 
    exists (
      select 1 from public.expenses e 
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );
create policy "Authors can soft-delete comments" on public.expense_comments
  for update using (user_id = auth.uid());

-- 7. Settlements policies
alter table public.settlements enable row level security;
create policy "Settlements are viewable by group members" on public.settlements
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "Group members can record settlements" on public.settlements
  for insert with check (
    public.is_group_member(group_id, auth.uid()) and
    (paid_by = auth.uid() or paid_to = auth.uid() or created_by = auth.uid())
  );

-- 8. Group Invites policies
alter table public.group_invites enable row level security;
create policy "Invites are viewable by group members or invitee" on public.group_invites
  for select using (
    public.is_group_member(group_id, auth.uid()) or 
    email = (select email from public.users where id = auth.uid())
  );
create policy "Group members can create invites" on public.group_invites
  for insert with check (public.is_group_member(group_id, auth.uid()));
create policy "Invites can be updated by invitee or inviter" on public.group_invites
  for update using (
    invited_by = auth.uid() or 
    email = (select email from public.users where id = auth.uid())
  );
```

---

## 5. Core Application Logic

### 5.1 Real-Time Chat (Supabase Broadcast)
Supabase Realtime will listen for `INSERT` events on the `expense_comments` table filtered by the current `expense_id`.

**Subscription Hook Pattern:**
```typescript
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function useExpenseChat(expenseId: string) {
  const [comments, setComments] = useState<any[]>([]);

  useEffect(() => {
    // 1. Fetch initial non-deleted comments
    const fetchComments = async () => {
      const { data } = await supabase
        .from('expense_comments')
        .select(`
          id, content, created_at, deleted_at,
          users ( id, full_name, email )
        `)
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });
      if (data) setComments(data);
    };

    fetchComments();

    // 2. Subscribe to new comments
    const channel = supabase
      .channel(`expense-chat:${expenseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expense_comments',
          filter: `expense_id=eq.${expenseId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch author user details to append
            const { data: userProfile } = await supabase
              .from('users')
              .select('id, full_name, email')
              .eq('id', payload.new.user_id)
              .single();
            
            const newComment = { ...payload.new, users: userProfile };
            setComments((prev) => [...prev, newComment]);
          } else if (payload.eventType === 'UPDATE') {
            // Handle soft deletes / updates
            setComments((prev) =>
              prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [expenseId]);

  return { comments };
}
```

### 5.2 Splitting Algorithms & Exact Validation
All floating point values are handled with cents resolution (`Math.round(val * 100) / 100`) to avoid floating point representation bugs.

#### Equal Splits
*   **Formula:** `base_share = Math.floor((total_amount / N) * 100) / 100` where `N` is the number of participants.
*   **Rounding Remainder:** The remainder cents (`total_amount - (base_share * N)`) are allocated to the **payer** (`paid_by` user's share).
*   **Example:** ₹100 split 3 ways (User A, B, C; A paid).
    *   `base_share` = ₹33.33.
    *   Total allocated = ₹99.99.
    *   Remainder = ₹0.01.
    *   A gets ₹33.33 + ₹0.01 = ₹33.34. B and C owe ₹33.33.

#### Exact Amounts
*   **Validation:** Inputs must exactly match `total_amount`.
*   **UI checks:** Calculate running total `assigned = Sum(shares)`. Show validation warning if `assigned !== total_amount` and disable submit.

#### Percentage Splits
*   **Formula:** `user_share = Math.round((percent / 100) * total_amount * 100) / 100`.
*   **Validation:** Sum of percentages must equal exactly `100%`.
*   **Rounding Remainder:** Adjust the payer's share by the rounding remainder `total_amount - Sum(user_shares)`.

#### Share-Based Splits
*   **Formula:** `user_share = Math.round(((user_shares / total_shares) * total_amount) * 100) / 100`.
*   **Rounding Remainder:** The remainder cents (`total_amount - Sum(user_shares)`) are added to the **payer's** share.

---

### 5.3 Balances & Debt Simplification Algorithms

#### Raw Bilateral Balances (No Simplification)
Calculates net balances between each pair inside a group:
$$\text{Net Balance}(A \rightarrow B) = \sum \text{splits owed by A where B paid} - \sum \text{splits owed by B where A paid} + \sum \text{settlements where A paid B} - \sum \text{settlements where B paid A}$$

*   If Positive: A owes B.
*   If Negative: B owes A.

#### Debt Simplification (Greedy Min-Transactions)
Converts bilateral balances into the minimum number of transactions using the net-flow algorithm:
1.  Calculate each member's net flow within the group (Total Paid - Total Owed + Settlements Received - Settlements Paid).
2.  Split members into two sorted lists:
    *   `creditors` (Net flow > 0), sorted descending by balance.
    *   `debtors` (Net flow < 0), sorted ascending by balance (most negative first).
3.  Loop through lists:
    *   Pop the top creditor $C$ and top debtor $D$.
    *   Calculate payment: $P = \min(C.\text{balance}, |D.\text{balance}|)$.
    *   Record transaction: "$D$ pays $C$ an amount of $P$".
    *   Deduct $P$ from both balances:
        *   $C.\text{balance} \leftarrow C.\text{balance} - P$
        *   $D.\text{balance} \leftarrow D.\text{balance} + P$
    *   If remaining balances are non-zero, push them back into their respective sorted lists.
4.  Return the list of transactions.

---

## 6. UX Design & Aesthetics (DESIGN.md Alignment)

The visual design is built entirely on the tokens from `DESIGN.md`.

### 6.1 Color Architecture
```css
--color-primary: #f54e00;          /* Cursor Orange (CTAs, primary action text only) */
--color-primary-active: #d04200;   /* Active button state */
--color-ink: #26251e;              /* Near-black warm ink (headings, primary body text) */
--color-body: #5a5852;             /* Warm charcoal (paragraphs, muted labels) */
--color-muted: #807d72;            /* Light gray (placeholders, secondary info) */
--color-hairline: #e6e5e0;         /* 1px borders, separators */
--color-canvas: #f7f7f4;           /* Warm cream page floor (never white) */
--color-surface-card: #ffffff;    /* Pure white card backgrounds */
--color-semantic-success: #1f8a65; /* Owed balances (green) */
--color-semantic-error: #cf2d56;   /* You owe balances (red) */
```

### 6.2 Layout & Spacing Rules
*   **Desktop:** Sidebar on the left (260px wide, `--color-canvas-soft` background, 1px `--color-hairline` border on the right) + Main content grid capped at 1200px.
*   **Mobile:** Sticky bottom navigation bar, hiding the sidebar.
*   **Section Spacing:** Generous editorial rhythm (80px section spacing on desktop, 48px on mobile).
*   **Borders:** Hairlines only (1px solid `--color-hairline`). **No drop shadows anywhere.**
*   **Radius:** Inputs/buttons use `8px` (`rounded-md`); cards use `12px` (`rounded-lg`).
*   **Interactive Targets:** Touch elements must be at least `44px` tall.

### 6.3 Typography Hierarchy (Inter & JetBrains Mono)
*   **Page Titles:** Font Inter, Size `26px`, Weight `400`, Letter-spacing `-0.3px`, Ink text.
*   **Card Headings:** Font Inter, Size `18px`, Weight `600`, Ink text.
*   **Body Text:** Font Inter, Size `16px`, Weight `400`, Charcoal text.
*   **Monospace Elements:** Font JetBrains Mono, Size `14px` (Used for currency numbers, ledger rows, and balance balances).

---

## 7. Core Workflows & Router Specs

### 7.1 Signup & Login Modules
*   `/login`: Screen containing a centered login card. Text inputs for Email and Password. Primary orange CTA.
*   `/signup`: Similar to login, plus Full Name input.
*   When a user registers:
    1.  Create account via `supabase.auth.signUp()`.
    2.  User is redirected to wait for confirmation, or auto-logged in based on configuration.
    3.  A trigger automatically seeds the `public.users` profile row.

### 7.2 Accept Invite Flow (`/invite/:token`)
*   User clicks an invite link sent via email containing a unique query string token.
*   Check if token exists in `group_invites` and is `'pending'`.
*   If not logged in: Redirect to `/signup` carrying the token in query params. Once signed up, join automatically.
*   If logged in:
    1.  Insert row into `group_members` using `group_id` matching the token.
    2.  Update `group_invites.status` to `'accepted'`.
    3.  Redirect to `/groups/:id`.

### 7.3 Group Creation & Invitation post-creation
*   Create Group modal / page.
*   Invite members by typing email addresses.
*   *Post-creation Settings:* In `/groups/:id/settings`, display a list of current members (with a "Remove" button next to members who have a current net balance of ₹0) and a field to "Add Member" by email.
    *   If member email exists in `public.users` table: immediately insert to `group_members`.
    *   If member email does not exist: write to `group_invites` with a random UUID token, expires in 7 days. Send invitation email (simulated on screen or via simple Edge Function).

### 7.4 Adding and Editing Expenses
*   Click **Add Expense** (Orange Primary CTA).
*   **Form fields:** Description, amount, paid_by (select from members), date, split type toggle.
*   **Splitting Interface:**
    *   *Equal:* Shows checkbox list of group members (defaults to all checked).
    *   *Exact:* Shows inputs next to each checked member, enforcing `sum == amount`.
    *   *Percentage:* Shows percentage inputs, enforcing `sum == 100`.
    *   *Shares:* Shows share input count next to each member (defaults to 1 share each).
*   On submit, write `expenses` row and write matching rows in `expense_splits`.
*   On editing: Fetch existing split rows and pre-fill form. Updating updates both tables in a single transaction.

### 7.5 Settle Up Workflow
*   In `/groups/:id`, click **Settle Up** (Secondary button or contextual button next to simplified balance line).
*   Modal shows `Paid By` and `Paid To` selectors, prepopulated with debtor and creditor names, along with the net amount.
*   Upon submission, write a row to the `settlements` table. Balance summaries update instantly on subsequent fetch.

---

## 8. Verification & Test Scenarios

### Scenario 1: Equal 3-way Split
*   Group: Alice, Bob, Charlie (A, B, C).
*   Expense: A pays ₹300 for lunch, split equally.
*   Expected outcome: B owes A ₹100, C owes A ₹100.

### Scenario 2: Percentage Split
*   Group: Alice, Bob, Charlie.
*   Expense: A pays ₹1000 for transport. Split: B = 60%, C = 40%.
*   Expected outcome: B owes A ₹600, C owes A ₹400. Alice's split share is ₹0.

### Scenario 3: Partial Settlement
*   Group: Alice, Bob.
*   Expense: Alice pays ₹200. Split: Bob owes Alice ₹100.
*   Settlement: Bob pays Alice ₹60.
*   Expected outcome: Bob owes Alice ₹40.

### Scenario 4: Debt Simplification
*   Group: Alice, Bob, Charlie.
*   Expense 1: A pays ₹90 split equally. (B owes A ₹30, C owes A ₹30).
*   Expense 2: B pays ₹60 split equally. (A owes B ₹20, C owes B ₹20).
*   Calculated Net:
    *   Alice: +30 (paid) - 20 (owed) = +10.
    *   Bob: +20 (paid) - 30 (owed) = -10.
    *   Charlie: +0 (paid) - 20 - 30 = -50.
    *   Alice owes Bob nothing.
*   Simplified Ledger:
    *   Bob gets ₹10.
    *   Alice gets ₹10. (Wait, let's trace: net Alice = +10, net Bob = +10, net Charlie = -20? Ah, let's recount.
        *   Alice paid ₹90, owed ₹30. Net = +60 from Expense 1.
        *   Alice owed ₹20 from Expense 2. Overall Net = +40.
        *   Bob owed ₹30 from Expense 1.
        *   Bob paid ₹60, owed ₹20 from Expense 2. Net = +40. Overall Net = +10.
        *   Charlie owed ₹30 from Expense 1 and ₹20 from Expense 2. Overall Net = -50.
        *   Thus, Charlie owes ₹40 to Alice and ₹10 to Bob).
    *   Expected output: Charlie pays Alice ₹40, Charlie pays Bob ₹10. (2 transactions instead of 3).

### Scenario 5: Zero Balances after full settlement
*   Charlie records payment of ₹40 to Alice and ₹10 to Bob.
*   Expected outcome: Net balances for everyone show ₹0.

---

## 9. Build Plan & Phased Checklist

Refer to `Day 1`, `Day 2`, and `Day 3` feature checklists in Section 14 of the discovery session document to build the application iteratively. Review the current context and update this document as components are implemented.
