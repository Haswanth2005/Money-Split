import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, getBalanceClass, getGroupTypeIcon, formatDate } from '../utils/formatters'
import { Plus, Users, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import type { Group } from '../types'

interface DashboardBalance {
  totalOwed: number
  totalOwing: number
  groups: (Group & { my_balance: number; member_count: number })[]
}

async function fetchDashboardData(userId: string): Promise<DashboardBalance> {
  // Fetch user's groups with members
  const { data: memberRows } = await supabase
    .from('group_members')
    .select('group_id, groups(id, name, group_type, created_by, created_at, updated_at)')
    .eq('user_id', userId)

  if (!memberRows || memberRows.length === 0) {
    return { totalOwed: 0, totalOwing: 0, groups: [] }
  }

  const groupsRaw = memberRows.map((r) => (r.groups as any) as Group | null).filter(Boolean) as Group[]

  // For each group compute user's net balance
  const groupsWithBalance = await Promise.all(groupsRaw.map(async (g) => {
    // Get member count
    const { count: memberCount } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', g.id)

    // Get expenses and splits
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, paid_by, expense_splits(user_id, owed_share)')
      .eq('group_id', g.id)
      .is('deleted_at', null)

    const { data: settlements } = await supabase
      .from('settlements')
      .select('paid_by, paid_to, amount')
      .eq('group_id', g.id)

    let net = 0
    for (const exp of expenses || []) {
      for (const split of (exp.expense_splits || []) as { user_id: string; owed_share: number }[]) {
        if (split.user_id !== exp.paid_by) {
          if (exp.paid_by === userId) net += split.owed_share
          if (split.user_id === userId) net -= split.owed_share
        }
      }
    }
    for (const s of settlements || []) {
      if (s.paid_by === userId) net += s.amount
      if (s.paid_to === userId) net -= s.amount
    }

    return { ...g, my_balance: Math.round(net * 100) / 100, member_count: memberCount || 0 }
  }))

  const totalOwed = groupsWithBalance.filter(g => g.my_balance > 0).reduce((s, g) => s + g.my_balance, 0)
  const totalOwing = groupsWithBalance.filter(g => g.my_balance < 0).reduce((s, g) => s + Math.abs(g.my_balance), 0)

  return {
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalOwing: Math.round(totalOwing * 100) / 100,
    groups: groupsWithBalance,
  }
}

export function Dashboard() {
  const { user, profile } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: () => fetchDashboardData(user!.id),
    enabled: !!user,
  })

  const totalNet = (data?.totalOwed || 0) - (data?.totalOwing || 0)

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <p className="caption" style={{ marginBottom: 4 }}>Good day,</p>
            <h1 className="display-lg">{profile?.full_name || 'Loading…'}</h1>
          </div>
          <Link to="/groups/new" className="btn btn-primary" id="create-group-btn">
            <Plus size={16} />
            New Group
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Balance Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
          <SummaryCard
            label="You are owed"
            amount={data?.totalOwed || 0}
            type="positive"
            icon={<TrendingUp size={18} />}
            loading={isLoading}
          />
          <SummaryCard
            label="You owe"
            amount={data?.totalOwing || 0}
            type="negative"
            icon={<TrendingDown size={18} />}
            loading={isLoading}
          />
          <SummaryCard
            label="Net balance"
            amount={totalNet}
            type={totalNet >= 0 ? 'positive' : 'negative'}
            icon={<Users size={18} />}
            loading={isLoading}
          />
        </div>

        {/* Groups */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="title-md">Your groups</h2>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card" style={{ padding: '16px 20px' }}>
                <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 14, width: '25%' }} />
              </div>
            ))}
          </div>
        ) : !data?.groups.length ? (
          <div className="card">
            <div className="empty-state">
              <Users size={40} className="empty-state-icon" />
              <p className="empty-state-title">No groups yet</p>
              <p className="empty-state-desc">Create a group to start tracking shared expenses with friends.</p>
              <Link to="/groups/new" className="btn btn-primary" style={{ marginTop: 8 }}>
                <Plus size={16} />
                Create first group
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.groups.map((group) => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div className="card card-hover" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: 'var(--color-canvas)',
                        border: '1px solid var(--color-hairline)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, flexShrink: 0,
                      }}>
                        {getGroupTypeIcon(group.group_type)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p className="title-sm truncate">{group.name}</p>
                        <p className="caption">{group.member_count} members · {formatDate(group.updated_at)}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {group.my_balance !== 0 && (
                        <span className={getBalanceClass(group.my_balance)}>
                          {group.my_balance > 0 ? '+' : ''}{formatCurrency(group.my_balance)}
                        </span>
                      )}
                      {group.my_balance === 0 && (
                        <span className="balance-chip balance-chip-zero">Settled</span>
                      )}
                      <ArrowRight size={14} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, amount, type, icon, loading }: {
  label: string
  amount: number
  type: 'positive' | 'negative'
  icon: React.ReactNode
  loading: boolean
}) {
  const color = type === 'positive' ? 'var(--color-success)' : 'var(--color-error)'

  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
        <span className="caption" style={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
          {label}
        </span>
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 28, width: '60%' }} />
      ) : (
        <p className="mono" style={{ fontSize: 24, fontWeight: 600, color, letterSpacing: '-0.5px' }}>
          {formatCurrency(amount)}
        </p>
      )}
    </div>
  )
}
