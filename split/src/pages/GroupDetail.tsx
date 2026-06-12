import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatDate, getGroupTypeIcon, getInitials, getBalanceClass } from '../utils/formatters'
import { computeNetBalances, simplifyDebts } from '../utils/simplification'
import { Plus, Settings, ArrowLeft, ArrowRight, Users } from 'lucide-react'
import type { Expense, GroupMember, Settlement } from '../types'

async function fetchGroupData(groupId: string) {
  const [groupRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*, users(id, email, full_name)').eq('group_id', groupId),
    supabase.from('expenses')
      .select('*, payer:users!paid_by(id, full_name, email), expense_splits(user_id, owed_share, share_units)')
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('date', { ascending: false }),
    supabase.from('settlements')
      .select('*, payer:users!paid_by(id, full_name), payee:users!paid_to(id, full_name)')
      .eq('group_id', groupId)
      .order('date', { ascending: false }),
  ])

  return {
    group: groupRes.data,
    members: (membersRes.data || []) as GroupMember[],
    expenses: (expensesRes.data || []) as Expense[],
    settlements: (settlementsRes.data || []) as Settlement[],
  }
}

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'expenses' | 'balances'>('expenses')
  const [simplifyMode, setSimplifyMode] = useState(true)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => fetchGroupData(id!),
    enabled: !!id,
  })

  const group = data?.group
  const members = data?.members || []
  const expenses = data?.expenses || []
  const settlements = data?.settlements || []

  // Compute balances
  const memberList = members.map((m) => ({ id: m.user_id, name: (m.users as any)?.full_name || 'Unknown' }))
  const netBalances = computeNetBalances(
    memberList,
    expenses.map((e) => ({
      paid_by: e.paid_by,
      splits: (e.splits || []).map((s: any) => ({ user_id: s.user_id, owed_share: s.owed_share })),
    })),
    settlements.map((s) => ({ paid_by: s.paid_by, paid_to: s.paid_to, amount: s.amount }))
  )
  const simplified = simplifyDebts(netBalances)

  if (isLoading) {
    return (
      <div className="page-body">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ marginBottom: 12 }}>
            <div className="skeleton" style={{ height: 18, width: '50%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '30%' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!group) return <div className="page-body"><p className="body-sm text-muted">Group not found.</p></div>

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate('/dashboard')} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>{getGroupTypeIcon(group.group_type)} {group.group_type}</p>
              <h1 className="display-lg">{group.name}</h1>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to={`/groups/${id}/settings`} className="btn btn-secondary btn-sm" id="group-settings-btn">
              <Settings size={14} />
              Settings
            </Link>
            <Link to={`/groups/${id}/expenses/new`} className="btn btn-primary" id="add-expense-btn">
              <Plus size={16} />
              Add expense
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-bar">
          <button
            className={`tab-btn ${tab === 'expenses' ? 'active' : ''}`}
            onClick={() => setTab('expenses')}
            id="tab-expenses"
          >
            Expenses
          </button>
          <button
            className={`tab-btn ${tab === 'balances' ? 'active' : ''}`}
            onClick={() => setTab('balances')}
            id="tab-balances"
          >
            Balances
          </button>
        </div>
      </div>

      <div className="page-body">
        {tab === 'expenses' ? (
          <ExpensesTab expenses={expenses} groupId={id!} userId={user!.id} />
        ) : (
          <BalancesTab
            netBalances={netBalances}
            simplified={simplified}
            simplifyMode={simplifyMode}
            setSimplifyMode={setSimplifyMode}
            groupId={id!}
            members={members}
            userId={user!.id}
          />
        )}
      </div>
    </div>
  )
}

function ExpensesTab({ expenses, groupId, userId }: { expenses: Expense[]; groupId: string; userId: string }) {
  if (!expenses.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={40} /></div>
          <p className="empty-state-title">No expenses yet</p>
          <p className="empty-state-desc">Add the first expense to start tracking splits.</p>
          <Link to={`/groups/${groupId}/expenses/new`} className="btn btn-primary" style={{ marginTop: 8 }}>
            <Plus size={16} />
            Add first expense
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {expenses.map((expense) => {
        const myShare = (expense.splits || []).find((s: any) => s.user_id === userId)
        const iAmPayer = expense.paid_by === userId

        return (
          <Link
            key={expense.id}
            to={`/groups/${groupId}/expenses/${expense.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div className="card card-hover" style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="title-sm truncate" style={{ marginBottom: 3 }}>{expense.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="caption">{formatDate(expense.date)}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--color-muted-soft)', flexShrink: 0 }} />
                    <span className="caption">
                      Paid by {(expense.payer as any)?.full_name || '…'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 2 }}>
                    {formatCurrency(expense.amount)}
                  </p>
                  {iAmPayer && myShare ? (
                    <span style={{ fontSize: 12, color: 'var(--color-success)' }}>you paid</span>
                  ) : myShare ? (
                    <span style={{ fontSize: 12, color: 'var(--color-error)' }}>
                      you owe {formatCurrency((myShare as any).owed_share)}
                    </span>
                  ) : null}
                </div>
                <ArrowRight size={14} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function BalancesTab({
  netBalances, simplified, simplifyMode, setSimplifyMode, groupId, members, userId
}: any) {
  const myBalance = netBalances.find((b: any) => b.userId === userId)

  return (
    <div>
      {/* My summary */}
      {myBalance && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
          <p className="caption" style={{ marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
            Your balance in this group
          </p>
          <span className={getBalanceClass(myBalance.balance)} style={{ fontSize: 18, fontWeight: 700 }}>
            {myBalance.balance === 0 ? 'Settled up ✓' : myBalance.balance > 0
              ? `+${formatCurrency(myBalance.balance)} owed to you`
              : `${formatCurrency(myBalance.balance)} you owe`}
          </span>
        </div>
      )}

      {/* Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="title-sm">Who owes whom</h2>
        <div style={{ display: 'flex', background: 'var(--color-canvas)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          <button
            className={`btn btn-sm ${simplifyMode ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ border: 'none', borderRadius: 6, fontSize: 12 }}
            onClick={() => setSimplifyMode(true)}
          >
            Simplified
          </button>
          <button
            className={`btn btn-sm ${!simplifyMode ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ border: 'none', borderRadius: 6, fontSize: 12 }}
            onClick={() => setSimplifyMode(false)}
          >
            Raw
          </button>
        </div>
      </div>

      {simplifyMode ? (
        simplified.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <p className="empty-state-title">All settled up!</p>
              <p className="empty-state-desc">Everyone in this group is even.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {simplified.map((tx: any, i: number) => (
              <div key={i} className="card" style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar avatar-md" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
                      {getInitials(tx.fromUserName)}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>
                        <span style={{ color: 'var(--color-error)' }}>{tx.fromUserName}</span>
                        {' → '}
                        <span style={{ color: 'var(--color-success)' }}>{tx.toUserName}</span>
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--color-error)' }}>
                      {formatCurrency(tx.amount)}
                    </span>
                    <Link
                      to={`/groups/${groupId}/settle?from=${tx.fromUserId}&to=${tx.toUserId}&amount=${tx.amount}`}
                      className="btn btn-primary btn-sm"
                    >
                      Settle
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {netBalances.filter((b: any) => Math.abs(b.balance) > 0.005).map((b: any) => (
            <div key={b.userId} className="card" style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar avatar-md">{getInitials(b.userName)}</div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{b.userName}</p>
                </div>
                <span className={getBalanceClass(b.balance)}>
                  {b.balance > 0 ? `+${formatCurrency(b.balance)}` : formatCurrency(b.balance)}
                </span>
              </div>
            </div>
          ))}
          {netBalances.every((b: any) => Math.abs(b.balance) <= 0.005) && (
            <div className="card">
              <div className="empty-state" style={{ padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <p className="empty-state-title">All settled up!</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
