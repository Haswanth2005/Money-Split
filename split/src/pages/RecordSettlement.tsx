import { useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getInitials, formatCurrency } from '../utils/formatters'
import { ArrowLeft, Upload, X, Clock, History, Smartphone } from 'lucide-react'
import type { GroupMember, SettlementStatus } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: SettlementStatus }) {
  const map: Record<SettlementStatus, { cls: string; label: string }> = {
    PENDING:               { cls: 'status-pending',   label: 'Pending' },
    AWAITING_CONFIRMATION: { cls: 'status-awaiting',  label: 'Awaiting Confirmation' },
    SETTLED:               { cls: 'status-settled',   label: 'Settled' },
    DISPUTED:              { cls: 'status-disputed',  label: 'Disputed' },
  }
  const { cls, label } = map[status]
  return (
    <span className={`status-chip ${cls}`}>
      <span className="status-chip-dot" />
      {label}
    </span>
  )
}

function Toast({ message, type = 'info', onDismiss }: { message: string; type?: 'info' | 'success' | 'error'; onDismiss: () => void }) {
  const colors: Record<string, string> = {
    info:    'var(--color-ink)',
    success: 'var(--color-success)',
    error:   'var(--color-error)',
  }
  return (
    <div
      className="toast animate-fade-in"
      style={{ background: colors[type], display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 380 }}
    >
      <span style={{ flex: 1, lineHeight: 1.5, fontSize: 13 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7, padding: 0, flexShrink: 0, marginTop: 1 }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RecordSettlement() {
  const { id: groupId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const defaultFrom   = searchParams.get('from')   || user?.id || ''
  const defaultTo     = searchParams.get('to')     || ''
  const defaultAmount = parseFloat(searchParams.get('amount') || '0')
  const defaultNote   = searchParams.get('note')   || ''

  const [paidBy,      setPaidBy]      = useState(defaultFrom)
  const [paidTo,      setPaidTo]      = useState(defaultTo)
  const [amount,      setAmount]      = useState(defaultAmount)
  const [note,        setNote]        = useState(defaultNote)
  const [isEditing,   setIsEditing]   = useState(!defaultTo || !defaultFrom || !defaultAmount)

  // Screenshot state
  const [screenshotFile,    setScreenshotFile]    = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI state
  const [toast,         setToast]         = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null)
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [settledId,     setSettledId]     = useState<string | null>(null)

  const showToast = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  // Members query
  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('*, users(id, email, full_name, upi_id)')
        .eq('group_id', groupId!)
      return (data || []) as GroupMember[]
    },
    enabled: !!groupId,
  })

  // Existing settlement query (if navigated from a pending one)
  const existingSettlementId = searchParams.get('sid')
  const { data: existingSettlement } = useQuery({
    queryKey: ['settlement', existingSettlementId],
    queryFn: async () => {
      const { data } = await supabase
        .from('settlements')
        .select('*')
        .eq('id', existingSettlementId!)
        .single()
      return data
    },
    enabled: !!existingSettlementId,
  })

  const currentStatus: SettlementStatus = existingSettlement?.status || 'PENDING'

  const receiverMember = members.find(m => m.user_id === paidTo)
  const receiverUser   = receiverMember?.users as any
  const receiverUpi    = receiverUser?.upi_id
  const receiverName   = receiverUser?.full_name || 'Receiver'

  // ── Screenshot handlers ──────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScreenshotFile(file)
    const reader = new FileReader()
    reader.onload = ev => setScreenshotPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const removeScreenshot = () => {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!screenshotFile) return null

    // Client-side validation
    const MAX_MB = 5
    if (screenshotFile.size > MAX_MB * 1024 * 1024) {
      showToast(`Screenshot must be under ${MAX_MB}MB`, 'error')
      return null
    }
    if (!screenshotFile.type.startsWith('image/')) {
      showToast('Only image files are allowed', 'error')
      return null
    }

    setUploadingScreenshot(true)
    const ext  = screenshotFile.name.split('.').pop() || 'jpg'
    const path = `${user?.id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('settlement-screenshots')
      .upload(path, screenshotFile, { upsert: true, contentType: screenshotFile.type })

    if (uploadError) {
      console.error('[Screenshot upload error]', uploadError)
      showToast('Screenshot upload failed: ' + uploadError.message, 'error')
      setUploadingScreenshot(false)
      return null
    }

    const { data } = supabase.storage.from('settlement-screenshots').getPublicUrl(path)
    setUploadingScreenshot(false)
    console.log('[Screenshot uploaded]', data.publicUrl)
    return data.publicUrl
  }

  // ── Pay with UPI (deep link) ─────────────────────────────────────────────

  const payViaUpi = () => {
    if (!receiverUpi) return
    const upiUrl = `upi://pay?pa=${encodeURIComponent(receiverUpi)}&pn=${encodeURIComponent(receiverName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note || 'Money Split Settlement')}`
    window.location.href = upiUrl
  }

  // ── "I Paid" — create/update settlement to AWAITING_CONFIRMATION ─────────

  const markAsPaid = async () => {
    if (!amount || amount <= 0) { showToast('Amount must be greater than 0', 'error'); return }
    if (paidBy === paidTo)      { showToast('Payer and receiver must be different', 'error'); return }

    setIsSubmitting(true)
    const screenshotUrl = await uploadScreenshot()

    try {
      if (existingSettlementId) {
        // Update existing settlement
        const { error } = await supabase
          .from('settlements')
          .update({
            status: 'AWAITING_CONFIRMATION',
            claimed_paid_at: new Date().toISOString(),
            screenshot_url: screenshotUrl || existingSettlement?.screenshot_url || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSettlementId)
        if (error) throw error
        setSettledId(existingSettlementId)
      } else {
        // Create new settlement
        const { data, error } = await supabase
          .from('settlements')
          .insert({
            group_id: groupId,
            paid_by: paidBy,
            paid_to: paidTo,
            amount,
            note: note || null,
            payment_method: 'UPI',
            status: 'AWAITING_CONFIRMATION',
            claimed_paid_at: new Date().toISOString(),
            screenshot_url: screenshotUrl,
            created_by: user?.id,
          })
          .select()
          .single()
        if (error) throw error
        setSettledId(data.id)
      }

      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      showToast(
        `Payment marked as awaiting confirmation. ${receiverName} will confirm once the money is received.`,
        'success'
      )
    } catch (err: any) {
      showToast(err.message || 'Something went wrong', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isConfirmed = currentStatus === 'SETTLED'
  const isDisputed  = currentStatus === 'DISPUTED'
  const isAwaiting  = currentStatus === 'AWAITING_CONFIRMATION'
  const actionDone  = !!settledId || isAwaiting || isConfirmed || isDisputed

  return (
    <div className="detail-layout">
      {/* Toast */}
      {toast && (
        <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />
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
              <h1 className="display-lg">Pay via UPI</h1>
            </div>
          </div>
          <Link
            to={`/groups/${groupId}/settlement-history`}
            className="btn btn-secondary btn-sm"
            id="settlement-history-btn"
          >
            <History size={14} />
            History
          </Link>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── UPI Action Card (Debtor View) ── */}
        <div className="upi-action-card">
          {/* Receiver avatar */}
          <div className="upi-receiver-avatar">
            {getInitials(receiverName)}
          </div>

          {/* Status chip */}
          <div style={{ marginBottom: 10 }}>
            <StatusChip status={actionDone && !settledId ? currentStatus : settledId ? 'AWAITING_CONFIRMATION' : 'PENDING'} />
          </div>

          {/* To label */}
          <p className="caption" style={{ marginBottom: 4 }}>You owe</p>

          {/* Amount */}
          <div className="upi-amount-display">
            {amount > 0 ? formatCurrency(amount) : '₹—'}
          </div>

          {/* Receiver name */}
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>
            to {receiverName}
          </p>

          {/* Note */}
          {note && (
            <p className="caption" style={{ marginBottom: 8 }}>for "{note}"</p>
          )}

          {/* UPI ID chip */}
          {receiverUpi ? (
            <span className="upi-id-chip">
              <Smartphone size={11} />
              {receiverUpi}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {receiverName} has no UPI ID set
            </span>
          )}
        </div>

        {/* ── Edit form (when no defaults) ── */}
        {isEditing && !actionDone && (
          <div className="card" style={{ padding: '20px 24px' }}>
            <h2 className="title-sm" style={{ marginBottom: 16 }}>Settlement details</h2>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label" htmlFor="settle-from">Paid by (you)</label>
              <select id="settle-from" className="input" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                <option value="">Select person</option>
                {members.map(m => { const u = m.users as any; return <option key={m.user_id} value={m.user_id}>{u?.full_name}</option> })}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label" htmlFor="settle-to">Paid to (receiver)</label>
              <select id="settle-to" className="input" value={paidTo} onChange={e => setPaidTo(e.target.value)}>
                <option value="">Select person</option>
                {members.filter(m => m.user_id !== paidBy).map(m => { const u = m.users as any; return <option key={m.user_id} value={m.user_id}>{u?.full_name}</option> })}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="form-label" htmlFor="settle-amount">Amount (₹)</label>
                <input id="settle-amount" type="number" min="0.01" step="0.01" className="input mono"
                  value={amount || ''} onChange={e => setAmount(+e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="form-label" htmlFor="settle-note">Note / Reason</label>
                <input id="settle-note" type="text" className="input" placeholder="e.g. dinner" value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)}>
              Done editing
            </button>
          </div>
        )}

        {/* ── Screenshot Upload ── */}
        {!actionDone && (
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <p className="title-sm">Payment screenshot</p>
                <p className="caption" style={{ marginTop: 2 }}>Optional — attach proof of payment</p>
              </div>
              {screenshotPreview && (
                <button onClick={removeScreenshot} className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }}>
                  <X size={14} /> Remove
                </button>
              )}
            </div>

            {screenshotPreview ? (
              <img src={screenshotPreview} alt="Payment screenshot" className="screenshot-preview" />
            ) : (
              <div className="screenshot-upload-zone" onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <Upload size={24} style={{ color: 'var(--color-muted)', margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Click to upload screenshot</p>
                <p className="caption" style={{ marginTop: 2 }}>PNG, JPG up to 5MB</p>
              </div>
            )}
          </div>
        )}

        {/* ── Post-action state ── */}
        {(actionDone || settledId) && (
          <div className="card" style={{ padding: '20px 24px', background: 'var(--color-success-bg)', border: '1px solid rgba(5,150,105,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28 }}>✅</div>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--color-success)', fontSize: 14 }}>
                  Payment claimed!
                </p>
                <p className="caption" style={{ marginTop: 2 }}>
                  Waiting for {receiverName} to confirm receipt.
                </p>
              </div>
            </div>
            {(existingSettlement?.claimed_paid_at || settledId) && (
              <div className="timestamp-row" style={{ marginTop: 12, borderTop: '1px solid rgba(5,150,105,0.15)', paddingTop: 12 }}>
                <Clock size={12} style={{ color: 'var(--color-success)' }} />
                Claimed at {new Date(existingSettlement?.claimed_paid_at || new Date()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}
            {settledId && (
              <Link
                to={`/groups/${groupId}/settlements/${settledId}/confirm`}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
              >
                View confirmation page →
              </Link>
            )}
          </div>
        )}

        {isDisputed && (
          <div className="card" style={{ padding: '20px 24px', background: 'var(--color-error-bg)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28 }}>⚠️</div>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--color-error)', fontSize: 14 }}>Payment disputed</p>
                <p className="caption" style={{ marginTop: 2 }}>{receiverName} has reported the payment was not received.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Action Buttons ── */}
        {!actionDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {receiverUpi && amount > 0 && (
              <button
                type="button"
                onClick={payViaUpi}
                className="btn btn-upi-pay btn-lg"
                id="pay-upi-btn"
                style={{ width: '100%', fontWeight: 700 }}
              >
                <Smartphone size={18} />
                Pay ₹{amount.toLocaleString('en-IN')} with UPI
              </button>
            )}
            <button
              type="button"
              onClick={markAsPaid}
              disabled={isSubmitting || uploadingScreenshot || !paidTo || !paidBy || amount <= 0}
              className="btn btn-i-paid btn-lg"
              id="i-paid-btn"
              style={{ width: '100%', fontWeight: 600 }}
            >
              {isSubmitting || uploadingScreenshot ? (
                <>Processing…</>
              ) : (
                <>✓ I Paid — Notify {receiverName}</>
              )}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              {!isEditing && (
                <button type="button" onClick={() => setIsEditing(true)} className="btn btn-ghost" style={{ flex: 1 }}>
                  Edit details
                </button>
              )}
            </div>
          </div>
        )}

        {actionDone && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => navigate(`/groups/${groupId}?tab=balances`)} className="btn btn-primary" style={{ flex: 1 }}>
              Back to group
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
