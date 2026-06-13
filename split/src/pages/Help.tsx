import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, AlertTriangle, CheckCircle2 } from 'lucide-react'

export function Help() {
  const navigate = useNavigate()
  const [bugDescription, setBugDescription] = useState('')
  const [toast, setToast] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleReportBug = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bugDescription.trim()) return
    setSubmitting(true)
    setTimeout(() => {
      showToast('Bug report submitted. Thank you!')
      setBugDescription('')
      setSubmitting(false)
    }, 800)
  }

  const faqs = [
    { q: 'How do I add someone to an existing group?', a: 'Go to the Group Details, click "Settings" at the top-right, and type their email address in the "Invite a member" section.' },
    { q: 'What is the difference between "Simplified" and "Raw" balances?', a: 'Raw balances show exactly who owes whom based directly on each expense. Simplified balances run a debt-simplification algorithm to reduce the total number of transactions needed to settle everyone.' },
    { q: 'How do I settle a debt?', a: 'In the group details Balances tab, click "Settle" next to any suggested transaction, input the settled amount, and save the payment record.' },
  ]

  return (
    <div className="detail-layout">
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>Support</p>
              <h1 className="display-lg">Help & Feedback</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="settings-grid">
          {/* Left: Help Center */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <MessageSquare size={18} style={{ color: 'var(--color-primary)' }} />
                <h2 className="title-sm">Help Center</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {faqs.map((faq, i) => (
                  <div key={i} style={{ borderBottom: i < faqs.length - 1 ? '1px solid var(--color-hairline-soft)' : 'none', paddingBottom: i < faqs.length - 1 ? 16 : 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>{faq.q}</p>
                    <p style={{ fontSize: 13, color: 'var(--color-body)' }}>{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Report a Bug */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <AlertTriangle size={18} style={{ color: 'var(--color-error)' }} />
                <h2 className="title-sm">Report a bug</h2>
              </div>
              <form onSubmit={handleReportBug}>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" htmlFor="bug-desc">Describe the issue</label>
                  <textarea
                    id="bug-desc"
                    className="input"
                    placeholder="Tell us what went wrong..."
                    value={bugDescription}
                    onChange={(e) => setBugDescription(e.target.value)}
                    style={{ minHeight: 120, fontSize: 14 }}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit report'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
          {toast}
        </div>
      )}
    </div>
  )
}
