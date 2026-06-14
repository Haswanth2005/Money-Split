import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, getInitials } from '../utils/formatters'
import { X, Bell, Clock, CheckCircle2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface PendingNotification {
  id: string
  group_id: string
  amount: number
  note: string | null
  claimed_paid_at: string | null
  status: string
  payer: { id: string; full_name: string } | null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function NotificationsSidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Fetch all AWAITING_CONFIRMATION settlements where I am the receiver
  const { data: notifications = [], isLoading } = useQuery<PendingNotification[]>({
    queryKey: ['global-notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('id, group_id, amount, note, claimed_paid_at, status, payer:users!paid_by(id, full_name)')
        .eq('paid_to', user!.id)
        .eq('status', 'AWAITING_CONFIRMATION')
        .order('claimed_paid_at', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as PendingNotification[]
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  })

  // ── Supabase Realtime subscription ───────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settlements',
          filter: `paid_to=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['global-notifications', user.id] })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, qc])

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className={`right-sidebar-overlay ${open ? 'visible' : ''}`}
        onClick={handleOverlayClick}
        aria-hidden={!open}
      />

      {/* Sidebar panel */}
      <aside
        className={`right-sidebar ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        {/* Header */}
        <div className="right-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={18} style={{ color: 'var(--color-primary)' }} />
            <h2 className="title-sm">Notifications</h2>
            {notifications.length > 0 && (
              <span className="notif-count-badge">{notifications.length}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close notifications"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="right-sidebar-body">
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="notif-card">
                  <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 11, width: '45%' }} />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-icon">
                <CheckCircle2 size={32} style={{ color: 'var(--color-success)' }} />
              </div>
              <p className="notif-empty-title">All caught up!</p>
              <p className="notif-empty-desc">No pending payment confirmations.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="caption" style={{ marginBottom: 4 }}>
                {notifications.length} payment{notifications.length > 1 ? 's' : ''} waiting for your confirmation
              </p>
              {notifications.map((n) => {
                const payerName = n.payer?.full_name || 'Someone'
                return (
                  <div key={n.id} className="notif-card">
                    {/* Payer avatar + info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                      <div
                        className="avatar avatar-md"
                        style={{
                          background: 'var(--color-error-bg)',
                          color: 'var(--color-error)',
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(payerName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 3 }}>
                          {payerName} paid you
                        </p>
                        <p className="mono notif-amount">{formatCurrency(n.amount)}</p>
                        {n.note && (
                          <p className="caption" style={{ marginTop: 3, fontStyle: 'italic' }}>
                            "{n.note}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    {n.claimed_paid_at && (
                      <div className="timestamp-row" style={{ marginBottom: 12, color: 'var(--color-warning)' }}>
                        <Clock size={11} />
                        <span>
                          {new Date(n.claimed_paid_at).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    )}

                    {/* Confirmation text */}
                    <p style={{ fontSize: 12, color: 'var(--color-body)', lineHeight: 1.5, marginBottom: 12, padding: '8px 10px', background: 'var(--color-canvas-soft-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-hairline)' }}>
                      💬 {payerName} claims to have paid {formatCurrency(n.amount)}
                      {n.note ? ` for "${n.note}"` : ''}. Please confirm or dispute below.
                    </p>

                    {/* Action buttons */}
                    <Link
                      to={`/groups/${n.group_id}/settlements/${n.id}/confirm`}
                      onClick={onClose}
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
                    >
                      Review & Confirm →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

// ─── Bell Button (exported separately for AppShell) ───────────────────────────
export function NotificationBell({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  return (
    <button
      id="notification-bell-btn"
      onClick={onClick}
      className="notification-bell-btn"
      aria-label={`Notifications${count > 0 ? ` (${count} pending)` : ''}`}
      title="Notifications"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="notification-bell-badge">{count > 9 ? '9+' : count}</span>
      )}
    </button>
  )
}
