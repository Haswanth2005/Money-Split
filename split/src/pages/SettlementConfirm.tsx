import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getInitials, formatCurrency } from '../utils/formatters'
import { ArrowLeft, Clock, CheckCircle2, XCircle, ImageOff, History } from 'lucide-react'
import type { SettlementStatus } from '../types'

// ─── Status Chip (shared) ─────────────────────────────────────────────────────

function StatusChip({ status }: { status: string | null | undefined }) {
  const map: Record<string, { cls: string; label: string }> = {
    PENDING:               { cls: 'status-pending',  label: 'Pending' },
    AWAITING_CONFIRMATION: { cls: 'status-awaiting', label: 'Awaiting Confirmation' },
    SETTLED:               { cls: 'status-settled',  label: 'Settled ✓' },
    DISPUTED:              { cls: 'status-disputed', label: 'Disputed' },
  }
  const resolved = map[status ?? ''] ?? { cls: 'status-pending', label: status ?? 'Unknown' }
  return (
    <span className={`status-chip ${resolved.cls}`}>
      <span className="status-chip-dot" />
      {resolved.label}
    </span>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmStyle,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  confirmStyle: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="title-md" style={{ marginBottom: 10 }}>{title}</h2>
        <p style={{ fontSize: 14, color: 'var(--color-body)', marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} className={`btn ${confirmStyle}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettlementConfirm() {
  const { id: groupId, sid } = useParams<{ id: string; sid: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showDisputeDialog, setShowDisputeDialog] = useState(false)
  const [isProcessing,      setIsProcessing]      = useState(false)
  const [toast,             setToast]             = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  // Fetch settlement with joined payer/payee
  const { data: settlement, isLoading, isError } = useQuery({
    queryKey: ['settlement', sid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, payer:users!paid_by(id, full_name), payee:users!paid_to(id, full_name)')
        .eq('id', sid!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!sid,
    placeholderData: (prev: any) => prev, // keep previous data while refetching
  })

  if (isLoading) {
    return (
      <div className="detail-layout">
        <div className="page-body">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 14, width: '40%' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !settlement) {
    return (
      <div className="detail-layout">
        <div className="page-header">
          <div className="page-header-inner">
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>
        <div className="page-body">
          <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>⚠️</p>
            <p className="empty-state-title">Settlement not found</p>
            <p className="empty-state-desc" style={{ marginTop: 6 }}>
              This settlement may have been deleted, or you may not have access.
            </p>
            <button
              onClick={() => navigate(-1)}
              className="btn btn-secondary"
              style={{ marginTop: 20 }}
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const payer   = (settlement.payer   ?? {}) as any
  const payee   = (settlement.payee   ?? {}) as any
  const status  = (settlement.status  ?? 'PENDING') as SettlementStatus
  const isReceiver = user?.id === settlement.paid_to
  const isPayer    = user?.id === settlement.paid_by
  const canAct     = isReceiver && status === 'AWAITING_CONFIRMATION'

  // ── Confirm received ──────────────────────────────────────────────────────

  const handleConfirm = async () => {
    setShowConfirmDialog(false)
    setIsProcessing(true)
    const { error } = await supabase
      .from('settlements')
      .update({
        status: 'SETTLED',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', sid!)
    setIsProcessing(false)
    if (error) {
      showToast('Failed to confirm: ' + error.message, 'error')
      return
    }
    qc.invalidateQueries({ queryKey: ['group', groupId] })
    qc.invalidateQueries({ queryKey: ['settlement', sid] })
    qc.invalidateQueries({ queryKey: ['global-notifications'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    showToast('Payment confirmed! ✓ Settlement marked as settled.', 'success')
  }

  // ── Not received / dispute ────────────────────────────────────────────────

  const handleDispute = async () => {
    setShowDisputeDialog(false)
    setIsProcessing(true)
    const { error } = await supabase
      .from('settlements')
      .update({
        status: 'DISPUTED',
      })
      .eq('id', sid!)
    setIsProcessing(false)
    if (error) {
      showToast('Failed to report: ' + error.message, 'error')
      return
    }
    qc.invalidateQueries({ queryKey: ['group', groupId] })
    qc.invalidateQueries({ queryKey: ['settlement', sid] })
    qc.invalidateQueries({ queryKey: ['global-notifications'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    showToast('Payment marked as disputed.', 'error')
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="detail-layout">
      {/* Toast */}
      {toast && (
        <div
          className="toast animate-fade-in"
          style={{ background: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}
        >
          {toast.msg}
        </div>
      )}

      {/* Dialogs */}
      {showConfirmDialog && (
        <ConfirmDialog
          title="Confirm receipt"
          message={`Please confirm you received ₹${formatCurrency(settlement.amount).replace('₹','')} from ${payer?.full_name}. This will mark the settlement as Settled and update balances.`}
          confirmLabel="Yes, I received it"
          confirmStyle="btn-primary"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirmDialog(false)}
        />
      )}
      {showDisputeDialog && (
        <ConfirmDialog
          title="Report payment not received"
          message={`Are you sure you have NOT received payment from ${payer?.full_name}? The settlement will be marked as Disputed.`}
          confirmLabel="Yes, report as not received"
          confirmStyle="btn-danger"
          onConfirm={handleDispute}
          onCancel={() => setShowDisputeDialog(false)}
        />
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>Settlement</p>
              <h1 className="display-md">Confirm payment</h1>
            </div>
          </div>
          <Link to={`/groups/${groupId}/settlement-history`} className="btn btn-secondary btn-sm">
            <History size={14} /> History
          </Link>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Notification card (receiver view) ── */}
        {isReceiver && status === 'AWAITING_CONFIRMATION' && (
          <div className="notification-banner" role="alert">
            <div className="notification-banner-icon">💸</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 2 }}>
                {payer?.full_name} claims to have paid {formatCurrency(settlement.amount)}
              </p>
              <p className="caption">
                {settlement.note ? `for "${settlement.note}"` : 'Please confirm or dispute below.'}
              </p>
            </div>
          </div>
        )}

        {/* ── Main confirm card ── */}
        <div className="confirm-card">
          <div className="confirm-card-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p className="caption" style={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</p>
              <StatusChip status={status} />
            </div>

            {/* Payer → Receiver flow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="avatar avatar-lg" style={{ margin: '0 auto 6px', background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
                  {getInitials(payer?.full_name || '?')}
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{payer?.full_name}</p>
                <p className="caption">paid</p>
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-muted)' }}>
                <p className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-ink)', marginBottom: 2 }}>
                  {formatCurrency(settlement.amount)}
                </p>
                <span style={{ fontSize: 18 }}>→</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="avatar avatar-lg" style={{ margin: '0 auto 6px', background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                  {getInitials(payee?.full_name || '?')}
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)' }}>{payee?.full_name}</p>
                <p className="caption">received</p>
              </div>
            </div>
          </div>

          <div className="confirm-card-body">
            {/* Note */}
            {settlement.note && (
              <div style={{ marginBottom: 16 }}>
                <p className="caption" style={{ marginBottom: 4 }}>Reason</p>
                <p style={{ fontSize: 14, color: 'var(--color-ink)', fontStyle: 'italic' }}>"{settlement.note}"</p>
              </div>
            )}

            {/* Payment method */}
            <div style={{ marginBottom: 16 }}>
              <p className="caption" style={{ marginBottom: 4 }}>Payment method</p>
              <span className="upi-id-chip" style={{ marginTop: 0 }}>
                💸 {settlement.payment_method || 'UPI'}
              </span>
            </div>

            {/* Timestamps */}
            <div style={{ borderTop: '1px solid var(--color-hairline-soft)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="timestamp-row">
                <Clock size={12} />
                <span>Created: {new Date(settlement.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              {settlement.claimed_paid_at && (
                <div className="timestamp-row" style={{ color: 'var(--color-warning)' }}>
                  <Clock size={12} />
                  <span>Payment claimed: {new Date(settlement.claimed_paid_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              )}
              {settlement.confirmed_at && (
                <div className="timestamp-row" style={{ color: 'var(--color-success)' }}>
                  <CheckCircle2 size={12} />
                  <span>Confirmed: {new Date(settlement.confirmed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Screenshot ── */}
        {settlement.screenshot_url ? (
          <div className="card" style={{ padding: '20px 24px' }}>
            <p className="title-sm" style={{ marginBottom: 12 }}>Payment screenshot</p>
            <img
              src={settlement.screenshot_url}
              alt="Payment proof"
              className="screenshot-preview"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        ) : (
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-muted)' }}>
              <ImageOff size={18} />
              <p style={{ fontSize: 13 }}>No payment screenshot provided</p>
            </div>
          </div>
        )}

        {/* ── Settled state ── */}
        {status === 'SETTLED' && (
          <div className="card animate-fade-in" style={{ padding: '20px 24px', background: 'var(--color-success-bg)', border: '1px solid rgba(5,150,105,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircle2 size={28} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: 15 }}>Payment settled!</p>
                <p className="caption" style={{ marginTop: 2 }}>
                  {isPayer ? `${payee?.full_name} confirmed receiving your payment.` : `You confirmed receiving payment from ${payer?.full_name}.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Disputed state ── */}
        {status === 'DISPUTED' && (
          <div className="card animate-fade-in" style={{ padding: '20px 24px', background: 'var(--color-error-bg)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <XCircle size={28} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, color: 'var(--color-error)', fontSize: 15 }}>Payment disputed</p>
                <p className="caption" style={{ marginTop: 2 }}>
                  {isPayer ? `${payee?.full_name} reported the payment was not received.` : `You reported not receiving this payment.`}
                </p>
              </div>
            </div>
            {isPayer && (
              <p className="caption" style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(220,38,38,0.08)', borderRadius: 'var(--radius-sm)' }}>
                💡 Try paying via UPI again or reach out to {payee?.full_name} directly.
              </p>
            )}
          </div>
        )}

        {/* ── Receiver action buttons ── */}
        {canAct && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setShowConfirmDialog(true)}
              disabled={isProcessing}
              className="btn btn-primary btn-lg"
              id="confirm-received-btn"
              style={{
                width: '100%',
                fontWeight: 700,
              }}
            >
              <CheckCircle2 size={18} />
              {isProcessing ? 'Processing…' : 'Confirm Received'}
            </button>
            <button
              onClick={() => setShowDisputeDialog(true)}
              disabled={isProcessing}
              className="btn btn-secondary btn-lg"
              id="not-received-btn"
              style={{ width: '100%', fontWeight: 600, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
            >
              <XCircle size={18} />
              Not Received
            </button>
          </div>
        )}

        {/* ── Payer view when awaiting ── */}
        {isPayer && status === 'AWAITING_CONFIRMATION' && (
          <div className="card" style={{ padding: '16px 20px', background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.2)' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-warning)', marginBottom: 4 }}>⏳ Awaiting confirmation</p>
            <p className="caption">{payee?.full_name} needs to confirm receipt of your payment.</p>
          </div>
        )}

        {/* ── Back button ── */}
        <button onClick={() => navigate(`/groups/${groupId}?tab=balances`)} className="btn btn-secondary" style={{ width: '100%' }}>
          Back to group
        </button>
      </div>
    </div>
  )
}
