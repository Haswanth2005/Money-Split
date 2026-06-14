import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, getBalanceClass, formatDate } from '../utils/formatters'
import { Plus, Users, TrendingUp, TrendingDown, ArrowRight, Calendar as CalendarIcon } from 'lucide-react'
import type { Group } from '../types'
interface DashboardBalance {
  totalOwed: number
  totalOwing: number
  groups: (Group & { my_balance: number; member_count: number; active_dates: string[] })[]
}

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'

const CustomTick = (props: any) => {
  const { x, y, payload } = props
  const isOct = payload.value === 'Oct'
  if (isOct) {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-22} y={3} width={44} height={20} rx={4} fill="var(--color-primary)" />
        <text x={0} y={16} textAnchor="middle" fill="var(--color-on-primary)" fontSize={11} fontWeight={600}>{payload.value}</text>
      </g>
    )
  }
  return (
    <text x={x} y={y + 16} textAnchor="middle" fill="var(--color-muted)" fontSize={11}>{payload.value}</text>
  )
}

function ExpensesChart() {
  const chartData = [
    { name: 'May', Owed: 3800, Owe: 1800 },
    { name: 'Jun', Owed: 5200, Owe: 1200 },
    { name: 'Jul', Owed: 4600, Owe: 2400 },
    { name: 'Aug', Owed: 6100, Owe: 2100 },
    { name: 'Sep', Owed: 5800, Owe: 3100 },
    { name: 'Oct', Owed: 8416.40, Owe: 1692.65 },
    { name: 'Nov', Owed: 7800, Owe: 1800 },
  ]

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 className="title-sm" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Expenses Overview</h3>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-muted)', fontWeight: 500 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }}></span>
              You're Owed
            </span>
            <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-muted)', fontWeight: 500 }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-error)', display: 'inline-block' }}></span>
              You Owe
            </span>
          </div>
        </div>
        <select className="input" style={{ width: 'auto', height: '32px', fontSize: '13px', padding: '0 30px 0 12px', borderRadius: 'var(--radius-sm)' }}>
          <option>This Month</option>
          <option>Last 6 Months</option>
        </select>
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorOwed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.18}/>
                <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorOwe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-error)" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="var(--color-error)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={<CustomTick />} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
            />
            <Tooltip 
              contentStyle={{ 
                background: 'var(--color-canvas)', 
                border: '1px solid var(--color-hairline)', 
                borderRadius: 'var(--radius-sm)', 
                boxShadow: '0px 4px 12px rgba(0,0,0,0.08)',
                color: 'var(--color-ink)'
              }} 
            />
            <ReferenceLine x="Oct" stroke="var(--color-hairline)" strokeWidth={1} />
            <Area 
              type="monotone" 
              dataKey="Owed" 
              stroke="var(--color-success)" 
              strokeWidth={2} 
              fillOpacity={1} 
              fill="url(#colorOwed)" 
              dot={{ stroke: 'var(--color-success)', strokeWidth: 2, r: 4, fill: 'var(--color-canvas)' }}
              activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--color-success)' }}
            />
            <Area 
              type="monotone" 
              dataKey="Owe" 
              stroke="var(--color-error)" 
              strokeWidth={2} 
              fillOpacity={1} 
              fill="url(#colorOwe)" 
              dot={{ stroke: 'var(--color-error)', strokeWidth: 2, r: 4, fill: 'var(--color-canvas)' }}
              activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--color-error)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
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
      .select('id, paid_by, date, expense_splits(user_id, owed_share)')
      .eq('group_id', g.id)
      .is('deleted_at', null)

    const { data: settlements } = await supabase
      .from('settlements')
      .select('paid_by, paid_to, amount')
      .eq('group_id', g.id)
      .eq('status', 'SETTLED')

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

    const activeDates = new Set<string>()
    const gd = new Date(g.created_at)
    activeDates.add(`${gd.getFullYear()}-${String(gd.getMonth() + 1).padStart(2, '0')}-${String(gd.getDate()).padStart(2, '0')}`)
    for (const exp of expenses || []) {
      if (exp.date) {
        const ed = new Date(exp.date)
        activeDates.add(`${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`)
      }
    }

    return {
      ...g,
      my_balance: Math.round(net * 100) / 100,
      member_count: memberCount || 0,
      active_dates: Array.from(activeDates)
    }
  }))

  const totalOwed = groupsWithBalance.filter(g => g.my_balance > 0).reduce((s, g) => s + g.my_balance, 0)
  const totalOwing = groupsWithBalance.filter(g => g.my_balance < 0).reduce((s, g) => s + Math.abs(g.my_balance), 0)

  return {
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalOwing: Math.round(totalOwing * 100) / 100,
    groups: groupsWithBalance,
  }
}

// Visual calendar component
function Calendar({ groups }: { groups: (Group & { member_count: number; active_dates: string[] })[] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDate = searchParams.get('date')

  const [currentDate, setCurrentDate] = useState(() => {
    if (selectedDate) {
      const d = new Date(selectedDate)
      if (!isNaN(d.getTime())) return d
    }
    return new Date()
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // First day of the month (0 = Sunday, 1 = Monday, etc.)
  const firstDayIndex = new Date(year, month, 1).getDay()
  // Number of days in the current month
  const totalDays = new Date(year, month + 1, 0).getDate()

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleDateClick = (day: number) => {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const dateStr = `${year}-${mm}-${dd}`

    const nextParams = new URLSearchParams(searchParams)
    if (selectedDate === dateStr) {
      nextParams.delete('date')
    } else {
      nextParams.set('date', dateStr)
    }
    setSearchParams(nextParams)
  }

  const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1)
  const emptyDays = Array.from({ length: firstDayIndex })

  // Map dates of groups (YYYY-MM-DD local format)
  const groupDates = groups.flatMap((g) => g.active_dates || [])

  // Check if a specific local date string has groups
  const hasGroup = (day: number) => {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const dateStr = `${year}-${mm}-${dd}`
    return groupDates.includes(dateStr)
  }

  // Check if a specific local date string is selected
  const isSelected = (day: number) => {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const dateStr = `${year}-${mm}-${dd}`
    return selectedDate === dateStr
  }

  return (
    <div className="card" style={{ padding: '24px', overflow: 'visible' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h3 className="title-sm" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{monthNames[month]} {year}</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handlePrevMonth}
            className="btn-secondary btn-sm"
            style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '14px' }}
            title="Previous month"
          >
            &larr;
          </button>
          <button
            onClick={handleNextMonth}
            className="btn-secondary btn-sm"
            style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '14px' }}
            title="Next month"
          >
            &rarr;
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '6px',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '11px',
        color: 'var(--color-muted)',
        textTransform: 'uppercase',
        marginBottom: '10px',
      }}>
        <div>Su</div>
        <div>Mo</div>
        <div>Tu</div>
        <div>We</div>
        <div>Th</div>
        <div>Fr</div>
        <div>Sa</div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '6px',
      }}>
        {emptyDays.map((_, idx) => (
          <div key={`empty-${idx}`} />
        ))}
        {daysArray.map((day) => {
          const selected = isSelected(day)
          const active = hasGroup(day)

          const mm = String(month + 1).padStart(2, '0')
          const dd = String(day).padStart(2, '0')
          const dateStr = `${year}-${mm}-${dd}`

          // Filter groups active on this date
          const dayGroups = groups.filter((g) => g.active_dates.includes(dateStr))

          // Latest 3 groups
          const latestGroups = [...dayGroups]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3)

          return (
            <div
              key={day}
              onClick={() => handleDateClick(day)}
              className="calendar-day-btn"
              style={{
                aspectRatio: '0.82',
                width: '100%',
                borderRadius: '18px',
                background: selected
                  ? 'var(--color-primary)'
                  : active
                    ? 'var(--color-canvas-soft-2)'
                    : 'transparent',
                color: selected
                  ? 'var(--color-on-primary)'
                  : 'var(--color-ink)',
                fontSize: '13px',
                fontWeight: selected || active ? '600' : '400',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: (selected || active) ? '0 4px 10px rgba(0, 0, 0, 0.04)' : 'none',
                border: selected ? '1px solid var(--color-primary)' : active ? '1px solid var(--color-hairline)' : 'none',
              }}
            >
              <span style={{ transform: (selected || active) ? 'translateY(-3.5px)' : 'none' }}>{day}</span>
              {active && (
                <span style={{
                  position: 'absolute',
                  bottom: '7px',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: selected ? '#ffffff' : 'var(--color-success)',
                }} />
              )}
              {active && latestGroups.length > 0 && (
                <div className="calendar-tooltip">
                  <div style={{
                    fontWeight: 600,
                    fontSize: '10px',
                    color: 'var(--color-muted)',
                    marginBottom: '6px',
                    borderBottom: '1px solid var(--color-hairline)',
                    paddingBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Groups ({dayGroups.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {latestGroups.map((g) => (
                      <Link
                        key={g.id}
                        to={`/groups/${g.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="calendar-tooltip-link"
                      >
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: 'var(--color-ink)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '176px',
                          display: 'block'
                        }}>
                          {g.name}
                        </span>
                        <span style={{ fontSize: '9px', color: 'var(--color-muted)' }}>
                          {g.member_count} members
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Dashboard() {
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const searchDate = searchParams.get('date')

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
          <div className="page-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/groups/new" className="btn btn-secondary" id="create-group-btn">
              <Plus size={16} />
              New Group
            </Link>
            <Link to="/expenses/new" className="btn btn-primary" id="add-expense-btn">
              <Plus size={16} />
              Add Expense
            </Link>
          </div>
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

        {/* Dashboard 2-column Grid */}
        <div className="dashboard-grid">
          {/* Left Column: Chart */}
          <div className="dashboard-chart">
            <ExpensesChart />
          </div>

          {/* Left Column: Groups */}
          <div className="dashboard-groups">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="title-md">
                {searchDate ? `Active groups on ${searchDate}` : 'Your groups'}
              </h2>
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
            ) : (() => {
              // Optionally filter dashboard list too if date is selected
              const dashboardFilteredGroups = searchDate
                ? data.groups.filter((g) => g.active_dates.includes(searchDate))
                : data.groups

              if (dashboardFilteredGroups.length === 0) {
                return (
                  <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>No active groups on this date.</p>
                  </div>
                )
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dashboardFilteredGroups.map((group) => (
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
                              flexShrink: 0,
                            }}>
                              <Users size={18} style={{ color: 'var(--color-muted)' }} />
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
              )
            })()}
          </div>

          {/* Right Column: Calendar */}
          <div className="dashboard-calendar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <CalendarIcon size={18} style={{ color: 'var(--color-muted)' }} />
              <h2 className="title-md" style={{ margin: 0 }}>Filter by Date</h2>
            </div>
            <Calendar groups={data?.groups || []} />
          </div>
        </div>
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
