// ─── Database Types ────────────────────────────────────────────────────────────

export type GroupCategory = 'home' | 'trip' | 'couple' | 'other'
export type SplitMechanism = 'equal' | 'exact' | 'percentage' | 'shares'
export type InviteStatus = 'pending' | 'accepted' | 'expired'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string | null
  created_at: string
}

export interface Group {
  id: string
  name: string
  group_type: GroupCategory
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  member_count?: number
  my_balance?: number
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  joined_at: string
  users?: User
}

export interface Expense {
  id: string
  group_id: string
  description: string
  amount: number
  currency: string
  paid_by: string
  split_type: SplitMechanism
  date: string
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  payer?: User
  splits?: ExpenseSplit[]
}

export interface ExpenseSplit {
  id: string
  expense_id: string
  user_id: string
  owed_share: number
  share_units: number | null
  users?: User
}

export interface ExpenseComment {
  id: string
  expense_id: string
  user_id: string
  content: string
  created_at: string
  deleted_at: string | null
  users?: User
}

export interface GroupInvite {
  id: string
  group_id: string
  invited_by: string
  email: string
  token: string
  status: InviteStatus
  created_at: string
  expires_at: string
  groups?: Group
}

export interface Settlement {
  id: string
  group_id: string
  paid_by: string
  paid_to: string
  amount: number
  note: string | null
  date: string
  created_by: string | null
  created_at: string
  // Joined
  payer?: User
  payee?: User
}

// ─── App-level Types ───────────────────────────────────────────────────────────

export interface BilateralBalance {
  userId: string
  userName: string
  amount: number // positive = they owe me, negative = I owe them
}

export interface SimplifiedTransaction {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number
}

export interface GroupBalance {
  userId: string
  userName: string
  netBalance: number // positive = creditor, negative = debtor
}

export interface SplitParticipant {
  userId: string
  name: string
  value: number // amount / percentage / shares depending on split type
}

export interface FormExpense {
  description: string
  amount: number
  paid_by: string
  split_type: SplitMechanism
  date: string
  participants: SplitParticipant[]
}
