import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, getInitials, getBalanceClass } from '../utils/formatters'
import { computeNetBalances, simplifyDebts } from '../utils/simplification'
import { Plus, Settings, ArrowLeft, ArrowRight, Users, Clock, History } from 'lucide-react'
import type { Expense, GroupMember, Settlement } from '../types'

async function fetchGroupData(groupId: string) {
  const [groupRes, membersRes, expensesRes, settlementsRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*, users(id, email, full_name)').eq('group_id', groupId),
    supabase.from('expenses')
      .select('*, payer:users!paid_by(id, full_name, email), splits:expense_splits(user_id, owed_share, share_units)')
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('date', { ascending: false }),
    supabase.from('settlements')
      .select('*, payer:users!paid_by(id, full_name), payee:users!paid_to(id, full_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
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

  // Use URL search params to deep-link to balances tab
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tabInit] = useState(() => (tabParam === 'balances' ? 'balances' : 'expenses') as 'expenses' | 'balances')
  const activeTab = tabParam === 'balances' ? 'balances' : tab === 'balances' ? 'balances' : tabInit === 'balances' ? 'balances' : tab

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
    settlements
      .filter((s: any) => s.status === 'SETTLED')
      .map((s: any) => ({ paid_by: s.paid_by, paid_to: s.paid_to, amount: s.amount }))
  )
  const simplified = simplifyDebts(netBalances)

  // Pending confirmations where current user is receiver
  const pendingForMe = settlements.filter(
    (s: any) => s.paid_to === user?.id && s.status === 'AWAITING_CONFIRMATION'
  )

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
              <p className="caption" style={{ marginBottom: 2 }}>Group</p>
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
            className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => setTab('expenses')}
            id="tab-expenses"
          >
            Expenses
          </button>
          <button
            className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
            onClick={() => setTab('balances')}
            id="tab-balances"
          >
            Balances
            {pendingForMe.length > 0 && (
              <span className="notification-badge" style={{ marginLeft: 6 }}>
                {pendingForMe.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="page-body">
        {activeTab === 'expenses' ? (
          <ExpensesTab expenses={expenses} groupId={id!} userId={user!.id} groupCreatedAt={group.created_at} />
        ) : (
          <BalancesTab
            netBalances={netBalances}
            simplified={simplified}
            simplifyMode={simplifyMode}
            setSimplifyMode={setSimplifyMode}
            groupId={id!}
            userId={user!.id}
            pendingForMe={pendingForMe}
          />
        )}
      </div>
    </div>
  )
}

function ExpensesTab({
  expenses,
  groupId,
  userId,
  groupCreatedAt
}: {
  expenses: Expense[]
  groupId: string
  userId: string
  groupCreatedAt: string
}) {
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

  // Calculate calendar days difference (day_number starts at 1)
  const getDayNumber = (expenseDate: string) => {
    const start = new Date(groupCreatedAt.split('T')[0])
    const current = new Date(expenseDate)
    const diffTime = current.getTime() - start.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(1, diffDays + 1)
  }

  // Group expenses by Day Number ascending
  let maxDay = 1
  expenses.forEach((e) => {
    const day = getDayNumber(e.date)
    if (day > maxDay) maxDay = day
  })

  const start = new Date(groupCreatedAt.split('T')[0])
  const grouped: Record<number, { date: string; list: Expense[] }> = {}

  for (let d = 1; d <= maxDay; d++) {
    const dDate = new Date(start.getTime() + (d - 1) * 24 * 60 * 60 * 1000)
    grouped[d] = { date: dDate.toISOString().split('T')[0], list: [] }
  }

  expenses.forEach((e) => {
    const day = getDayNumber(e.date)
    if (grouped[day]) {
      grouped[day].list.push(e)
    }
    if (day > 1 && grouped[day - 1]) {
      if (!grouped[day - 1].list.some(ex => ex.id === e.id)) {
        grouped[day - 1].list.push(e)
      }
    }
  })

  const sortedDays = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {sortedDays.map((dayNum) => {
        const { date, list } = grouped[dayNum]
        const formattedDate = new Date(date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })

        return (
          <div key={dayNum}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 6,
              borderBottom: '1px solid var(--color-hairline-soft)',
              marginBottom: 12
            }}>
              <h3 className="title-sm" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>
                Day {dayNum}
              </h3>
              <span className="caption" style={{ fontSize: 11 }}>{formattedDate}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((expense) => {
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
                          <p className="caption">
                            Paid by {(expense.payer as any)?.full_name || '…'}
                          </p>
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
          </div>
        )
      })}
    </div>
  )
}

function BalancesTab({
  netBalances, simplified, simplifyMode, setSimplifyMode, groupId, userId, pendingForMe
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
            {Math.abs(myBalance.balance) < 0.005 ? 'Settled up ✓' : myBalance.balance > 0
              ? `+${formatCurrency(myBalance.balance)} owed to you`
              : `${formatCurrency(Math.abs(myBalance.balance))} you owe`}
          </span>
        </div>
      )}

      {/* ── Pending confirmations banner ── */}
      {pendingForMe && pendingForMe.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {pendingForMe.map((s: any) => {
            const payerName = (s.payer as any)?.full_name || 'Someone'
            return (
              <div key={s.id} className="notification-banner" role="alert">
                <div className="notification-banner-icon">💸</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 2 }}>
                    {payerName} claims to have paid {formatCurrency(s.amount)}
                  </p>
                  {s.note && <p className="caption">for "{s.note}"</p>}
                  {s.claimed_paid_at && (
                    <div className="timestamp-row" style={{ marginTop: 4 }}>
                      <Clock size={11} style={{ color: 'var(--color-warning)' }} />
                      <span>{new Date(s.claimed_paid_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  )}
                </div>
                <Link
                  to={`/groups/${groupId}/settlements/${s.id}/confirm`}
                  className="btn btn-sm"
                  style={{ background: 'var(--color-warning)', color: '#fff', border: 'none', flexShrink: 0 }}
                >
                  Review
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* History link */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Link to={`/groups/${groupId}/settlement-history`} className="btn btn-ghost btn-sm">
          <History size={14} /> Settlement history
        </Link>
      </div>

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
                    {tx.fromUserId === userId && (
                      <Link
                        to={`/groups/${groupId}/settle?from=${tx.fromUserId}&to=${tx.toUserId}&amount=${tx.amount}`}
                        className="btn btn-primary btn-sm"
                      >
                        Settle
                      </Link>
                    )}
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
