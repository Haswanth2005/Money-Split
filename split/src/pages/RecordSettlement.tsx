import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getInitials, todayISO, formatCurrency } from '../utils/formatters'
import { ArrowLeft } from 'lucide-react'
import type { GroupMember } from '../types'

export function RecordSettlement() {
  const { id: groupId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const defaultFrom = searchParams.get('from') || user?.id || ''
  const defaultTo = searchParams.get('to') || ''
  const defaultAmount = parseFloat(searchParams.get('amount') || '0')

  const [paidBy, setPaidBy] = useState(defaultFrom)
  const [paidTo, setPaidTo] = useState(defaultTo)
  const [amount, setAmount] = useState(defaultAmount)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data } = await supabase.from('group_members').select('*, users(id, email, full_name)').eq('group_id', groupId!)
      return (data || []) as GroupMember[]
    },
    enabled: !!groupId,
  })

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || amount <= 0) { setError('Amount must be positive'); return }
    if (paidBy === paidTo) { setError('Payer and receiver must be different people'); return }

    setIsSubmitting(true)
    setError('')

    const { error: err } = await supabase.from('settlements').insert({
      group_id: groupId,
      paid_by: paidBy,
      paid_to: paidTo,
      amount,
      note: note || null,
      date,
      created_by: user?.id,
    })

    if (err) { setError(err.message); setIsSubmitting(false); return }

    qc.invalidateQueries({ queryKey: ['group', groupId] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    navigate(`/groups/${groupId}?tab=balances`)
    setIsSubmitting(false)
  }

  const getUsername = (userId: string) => {
    const m = members.find(m => m.user_id === userId)
    return (m?.users as any)?.full_name || 'Unknown'
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>Settlement</p>
              <h1 className="display-lg">Record payment</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 500 }}>
        {/* Visual summary */}
        {paidBy && paidTo && amount > 0 && (
          <div className="card" style={{ marginBottom: 24, padding: '20px 24px', background: 'var(--color-success-bg)', border: '1px solid rgba(31,138,101,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="avatar avatar-lg" style={{ margin: '0 auto 6px', background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
                  {getInitials(getUsername(paidBy))}
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{getUsername(paidBy)}</p>
                <p className="caption">pays</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(amount)}</p>
                <span style={{ fontSize: 20 }}>→</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="avatar avatar-lg" style={{ margin: '0 auto 6px', background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                  {getInitials(getUsername(paidTo))}
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>{getUsername(paidTo)}</p>
                <p className="caption">receives</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="card">
          <h2 className="title-sm" style={{ marginBottom: 20 }}>Settlement details</h2>

          <div style={{ marginBottom: 18 }}>
            <label className="form-label" htmlFor="settle-from">Paid by (debtor)</label>
            <select id="settle-from" className="input" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              <option value="">Select person</option>
              {members.map(m => { const u = m.users as any; return <option key={m.user_id} value={m.user_id}>{u?.full_name}</option> })}
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="form-label" htmlFor="settle-to">Paid to (creditor)</label>
            <select id="settle-to" className="input" value={paidTo} onChange={e => setPaidTo(e.target.value)}>
              <option value="">Select person</option>
              {members.filter(m => m.user_id !== paidBy).map(m => { const u = m.users as any; return <option key={m.user_id} value={m.user_id}>{u?.full_name}</option> })}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <label className="form-label" htmlFor="settle-amount">Amount (₹)</label>
              <input id="settle-amount" type="number" min="0.01" step="0.01" className="input mono"
                value={amount || ''} onChange={e => setAmount(+e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="form-label" htmlFor="settle-date">Date</label>
              <input id="settle-date" type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="form-label" htmlFor="settle-note">Note (optional)</label>
            <input id="settle-note" type="text" className="input" placeholder="e.g. UPI transfer" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {error && (
            <div style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 14, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting} id="record-settlement-btn">
              {isSubmitting ? 'Recording…' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
