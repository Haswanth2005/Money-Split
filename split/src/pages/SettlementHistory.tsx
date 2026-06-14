import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, getInitials } from '../utils/formatters'
import { ArrowLeft, Clock, Image } from 'lucide-react'
import type { SettlementStatus } from '../types'

// ─── Status Chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: SettlementStatus }) {
  const map: Record<SettlementStatus, { cls: string; label: string }> = {
    PENDING:               { cls: 'status-pending',  label: 'Pending' },
    AWAITING_CONFIRMATION: { cls: 'status-awaiting', label: 'Awaiting' },
    SETTLED:               { cls: 'status-settled',  label: 'Settled' },
    DISPUTED:              { cls: 'status-disputed', label: 'Disputed' },
  }
  const { cls, label } = map[status] ?? { cls: 'status-pending', label: status }
  return (
    <span className={`status-chip ${cls}`}>
      <span className="status-chip-dot" />
      {label}
    </span>
  )
}

// ─── Timeline dot color ───────────────────────────────────────────────────────

function dotColor(status: SettlementStatus) {
  const map: Record<SettlementStatus, string> = {
    PENDING:               'var(--color-muted)',
    AWAITING_CONFIRMATION: 'var(--color-warning)',
    SETTLED:               'var(--color-success)',
    DISPUTED:              'var(--color-error)',
  }
  return map[status] ?? 'var(--color-muted)'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettlementHistory() {
  const { id: groupId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ['settlements-history', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, payer:users!paid_by(id, full_name), payee:users!paid_to(id, full_name)')
        .eq('group_id', groupId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!groupId,
  })

  // Stats
  const total    = settlements.length
  const settled  = settlements.filter(s => s.status === 'SETTLED').length
  const awaiting = settlements.filter(s => s.status === 'AWAITING_CONFIRMATION').length
  const disputed = settlements.filter(s => s.status === 'DISPUTED').length

  const settledAmount = settlements
    .filter(s => s.status === 'SETTLED')
    .reduce((sum, s) => sum + Number(s.amount), 0)

  return (
    <div className="detail-layout">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>Group</p>
              <h1 className="display-lg">Settlement history</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Summary stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="caption" style={{ marginBottom: 4 }}>Total settled</p>
            <p className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)' }}>
              {formatCurrency(settledAmount)}
            </p>
            <p className="caption" style={{ marginTop: 2 }}>{settled} of {total} transactions</p>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <p className="caption" style={{ marginBottom: 8 }}>Status breakdown</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {awaiting > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="status-chip status-awaiting" style={{ fontSize: 11 }}>
                    <span className="status-chip-dot" />Awaiting
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-warning)' }}>{awaiting}</span>
                </div>
              )}
              {disputed > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="status-chip status-disputed" style={{ fontSize: 11 }}>
                    <span className="status-chip-dot" />Disputed
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-error)' }}>{disputed}</span>
                </div>
              )}
              {settled > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="status-chip status-settled" style={{ fontSize: 11 }}>
                    <span className="status-chip-dot" />Settled
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)' }}>{settled}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Timeline ── */}
        {isLoading ? (
          <div className="card">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="history-item">
                <div className="skeleton" style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 12, width: '30%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : settlements.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ padding: 48 }}>
              <div className="empty-state-icon">🧾</div>
              <p className="empty-state-title">No settlements yet</p>
              <p className="empty-state-desc">When you settle up with group members, the history will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-hairline)' }}>
              <h2 className="title-sm">All settlements</h2>
            </div>
            {settlements.map((s: any) => {
              const payer = s.payer as any
              const payee = s.payee as any
              const status: SettlementStatus = s.status
              const isMyPayment = s.paid_by === user?.id
              const isMyReceipt = s.paid_to  === user?.id

              return (
                <Link
                  key={s.id}
                  to={`/groups/${groupId}/settlements/${s.id}/confirm`}
                  style={{ textDecoration: 'none' }}
                >
                  <div className="history-item">
                    {/* Timeline dot */}
                    <div
                      className="history-timeline-dot"
                      style={{ background: dotColor(status), boxShadow: `0 0 0 3px ${dotColor(status)}20` }}
                    />

                    {/* Avatars */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: -6, position: 'relative', width: 48, flexShrink: 0 }}>
                      <div className="avatar avatar-md" style={{ position: 'absolute', left: 0, background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '2px solid var(--color-canvas)', zIndex: 2 }}>
                        {getInitials(payer?.full_name || '?')}
                      </div>
                      <div className="avatar avatar-md" style={{ position: 'absolute', left: 18, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '2px solid var(--color-canvas)', zIndex: 1 }}>
                        {getInitials(payee?.full_name || '?')}
                      </div>
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0, paddingLeft: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-error)' }}>{payer?.full_name}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>→</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>{payee?.full_name}</span>
                        {(isMyPayment || isMyReceipt) && (
                          <span style={{ fontSize: 10, background: 'var(--color-canvas-soft-2)', color: 'var(--color-muted)', padding: '1px 5px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-hairline)' }}>
                            {isMyPayment ? 'you paid' : 'you received'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="caption">{new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {s.note && <span className="caption">· "{s.note}"</span>}
                        {s.screenshot_url && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-muted)' }}>
                            <Image size={10} /> screenshot
                          </span>
                        )}
                        {s.claimed_paid_at && status === 'AWAITING_CONFIRMATION' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--color-warning)' }}>
                            <Clock size={10} /> claimed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount + status */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)', marginBottom: 5 }}>
                        {formatCurrency(s.amount)}
                      </p>
                      <StatusChip status={status} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
