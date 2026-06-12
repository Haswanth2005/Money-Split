-- ─────────────────────────────────────────────────────────────────────────────
-- SplitApp — Supabase PostgreSQL Schema
-- Paste this entire file into the Supabase SQL Editor and run it.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── 1. ENUM TYPES ────────────────────────────────────────────────────────────
create type group_category as enum ('home', 'trip', 'couple', 'other');
create type split_mechanism as enum ('equal', 'exact', 'percentage', 'shares');
create type invite_status as enum ('pending', 'accepted', 'expired');

-- ── 2. USERS (Profile table linked to auth.users) ────────────────────────────
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ── 3. GROUPS ────────────────────────────────────────────────────────────────
create table public.groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  group_type group_category default 'other'::group_category not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ── 4. GROUP MEMBERS ─────────────────────────────────────────────────────────
create table public.group_members (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (group_id, user_id)
);

-- ── 5. EXPENSES ──────────────────────────────────────────────────────────────
create table public.expenses (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text default 'INR'::text not null,
  paid_by uuid references public.users(id) on delete restrict not null,
  split_type split_mechanism default 'equal'::split_mechanism not null,
  date date default current_date not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- ── 6. EXPENSE SPLITS ────────────────────────────────────────────────────────
create table public.expense_splits (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references public.expenses(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  owed_share numeric(12, 2) not null check (owed_share >= 0),
  share_units integer check (share_units >= 0),
  unique (expense_id, user_id)
);

-- ── 7. EXPENSE COMMENTS ──────────────────────────────────────────────────────
create table public.expense_comments (
  id uuid default uuid_generate_v4() primary key,
  expense_id uuid references public.expenses(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  content text not null check (char_length(content) <= 1000),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- ── 8. GROUP INVITES ─────────────────────────────────────────────────────────
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

-- ── 9. SETTLEMENTS ───────────────────────────────────────────────────────────
create table public.settlements (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  paid_by uuid references public.users(id) on delete restrict not null,
  paid_to uuid references public.users(id) on delete restrict not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  date date default current_date not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ── 10. TRIGGER: Sync auth.users → public.users ──────────────────────────────
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

-- ── 11. HELPER: is_group_member ──────────────────────────────────────────────
create or replace function public.is_group_member(group_uuid uuid, user_uuid uuid)
returns boolean security definer as $$
begin
  return exists (
    select 1 from public.group_members
    where group_id = group_uuid and user_id = user_uuid
  );
end;
$$ language plpgsql;

-- ── 12. ROW LEVEL SECURITY POLICIES ─────────────────────────────────────────

-- 12a. Users
alter table public.users enable row level security;

create policy "Users are viewable by authenticated users"
  on public.users for select
  using (auth.role() = 'authenticated');

create policy "Users can update their own profile"
  on public.users for update
  using (id = auth.uid());

-- 12b. Groups
alter table public.groups enable row level security;

create policy "Groups are viewable by members"
  on public.groups for select
  using (public.is_group_member(id, auth.uid()) or created_by = auth.uid());

create policy "Authenticated users can create groups"
  on public.groups for insert
  with check (auth.uid() is not null);

create policy "Creator can update group"
  on public.groups for update
  using (created_by = auth.uid());

create policy "Creator can delete group"
  on public.groups for delete
  using (created_by = auth.uid());

-- 12c. Group Members
alter table public.group_members enable row level security;

create policy "Members are viewable by fellow group members"
  on public.group_members for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Members can be inserted by authenticated users"
  on public.group_members for insert
  with check (auth.uid() is not null);

create policy "Members can leave or creator can remove"
  on public.group_members for delete
  using (
    user_id = auth.uid() or
    exists (select 1 from public.groups where id = group_id and created_by = auth.uid())
  );

-- 12d. Expenses
alter table public.expenses enable row level security;

create policy "Expenses are viewable by group members"
  on public.expenses for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Group members can insert expenses"
  on public.expenses for insert
  with check (public.is_group_member(group_id, auth.uid()));

create policy "Group members can update expenses"
  on public.expenses for update
  using (public.is_group_member(group_id, auth.uid()));

-- 12e. Expense Splits
alter table public.expense_splits enable row level security;

create policy "Splits are viewable by group members"
  on public.expense_splits for select
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy "Group members can manage splits"
  on public.expense_splits for all
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

-- 12f. Expense Comments
alter table public.expense_comments enable row level security;

create policy "Comments are viewable by group members"
  on public.expense_comments for select
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy "Group members can post comments"
  on public.expense_comments for insert
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy "Authors can soft-delete their own comments"
  on public.expense_comments for update
  using (user_id = auth.uid());

-- 12g. Settlements
alter table public.settlements enable row level security;

create policy "Settlements are viewable by group members"
  on public.settlements for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Group members can record settlements"
  on public.settlements for insert
  with check (public.is_group_member(group_id, auth.uid()));

-- 12h. Group Invites
alter table public.group_invites enable row level security;

create policy "Invites are viewable by group members or invitee"
  on public.group_invites for select
  using (
    public.is_group_member(group_id, auth.uid()) or
    email = (select email from public.users where id = auth.uid())
  );

create policy "Group members can create invites"
  on public.group_invites for insert
  with check (public.is_group_member(group_id, auth.uid()));

create policy "Invites can be updated by inviter or invitee"
  on public.group_invites for update
  using (
    invited_by = auth.uid() or
    email = (select email from public.users where id = auth.uid())
  );

-- ── 13. REALTIME ─────────────────────────────────────────────────────────────
-- After running this SQL, go to Supabase Dashboard → Database → Replication
-- and enable Realtime for the "expense_comments" table.

-- ── 14. INDEXES ──────────────────────────────────────────────────────────────
create index if not exists idx_group_members_group_id on public.group_members(group_id);
create index if not exists idx_group_members_user_id on public.group_members(user_id);
create index if not exists idx_expenses_group_id on public.expenses(group_id);
create index if not exists idx_expenses_deleted_at on public.expenses(deleted_at);
create index if not exists idx_expense_splits_expense_id on public.expense_splits(expense_id);
create index if not exists idx_expense_comments_expense_id on public.expense_comments(expense_id);
create index if not exists idx_settlements_group_id on public.settlements(group_id);
create index if not exists idx_group_invites_token on public.group_invites(token);
create index if not exists idx_group_invites_email on public.group_invites(email);
