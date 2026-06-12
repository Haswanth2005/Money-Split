import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, todayISO } from '../utils/formatters'
import { ArrowLeft } from 'lucide-react'
import { splitEqually, splitExact, splitByPercentage, splitByShares, validateExactSplit, validatePercentageSplit } from '../utils/splitting'
import type { SplitMechanism, GroupMember } from '../types'

export function ExpenseEdit() {
  const { id: groupId, eid } = useParams<{ id: string; eid: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [serverError, setServerError] = useState('')
  const [splitError, setSplitError] = useState('')
  const [splitType, setSplitType] = useState<SplitMechanism>('equal')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState(todayISO())
  const [participants, setParticipants] = useState<{ userId: string; name: string; included: boolean; value: number }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data } = await supabase.from('group_members').select('*, users(id, email, full_name)').eq('group_id', groupId!)
      return (data || []) as GroupMember[]
    },
    enabled: !!groupId,
  })

  const { data: expense } = useQuery({
    queryKey: ['expense', eid],
    queryFn: async () => {
      const { data } = await supabase.from('expenses')
        .select('*, expense_splits(user_id, owed_share, share_units)')
        .eq('id', eid!).single()
      return data
    },
    enabled: !!eid,
  })

  // Populate form from existing expense
  useEffect(() => {
    if (!expense || members.length === 0) return
    setDescription(expense.description)
    setAmount(expense.amount)
    setPaidBy(expense.paid_by)
    setDate(expense.date)
    setSplitType(expense.split_type)

    const splits = expense.expense_splits || []
    setParticipants(members.map((m) => {
      const u = m.users as any
      const split = splits.find((s: any) => s.user_id === m.user_id)
      return {
        userId: m.user_id,
        name: u?.full_name || 'Unknown',
        included: !!split,
        value: expense.split_type === 'shares' ? (split?.share_units || 1) : (split?.owed_share || 0),
      }
    }))
  }, [expense, members.length])

  const included = participants.filter((p) => p.included)
  const totalAssigned = included.reduce((s, p) => s + p.value, 0)

  const onSubmit = async () => {
    if (!user) return
    setIsSubmitting(true)
    setServerError('')

    // Validate
    if (included.length === 0) { setSplitError('Select at least one participant'); setIsSubmitting(false); return }
    if (splitType === 'exact' && !validateExactSplit(included.map(p => p.value), amount)) {
      setSplitError(`Shares must sum to ${formatCurrency(amount)}`); setIsSubmitting(false); return
    }
    if (splitType === 'percentage' && !validatePercentageSplit(included.map(p => p.value))) {
      setSplitError('Percentages must sum to 100%'); setIsSubmitting(false); return
    }
    setSplitError('')

    let splits: { userId: string; owedShare: number; shareUnits?: number }[] = []
    if (splitType === 'equal') splits = splitEqually(amount, included.map(p => p.userId), paidBy)
    else if (splitType === 'exact') splits = splitExact(included.map(p => ({ userId: p.userId, amount: p.value })))
    else if (splitType === 'percentage') splits = splitByPercentage(amount, included.map(p => ({ userId: p.userId, percentage: p.value })), paidBy)
    else splits = splitByShares(amount, included.map(p => ({ userId: p.userId, units: p.value })), paidBy)

    const { error } = await supabase.from('expenses').update({
      description, amount, paid_by: paidBy, split_type: splitType, date, updated_at: new Date().toISOString()
    }).eq('id', eid!)

    if (error) { setServerError(error.message); setIsSubmitting(false); return }

    // Upsert splits
    await supabase.from('expense_splits').delete().eq('expense_id', eid!)
    await supabase.from('expense_splits').insert(
      splits.map(s => ({ expense_id: eid!, user_id: s.userId, owed_share: s.owedShare, share_units: s.shareUnits ?? null }))
    )

    qc.invalidateQueries({ queryKey: ['expense', eid] })
    qc.invalidateQueries({ queryKey: ['group', groupId] })
    navigate(`/groups/${groupId}/expenses/${eid}`)
    setIsSubmitting(false)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" aria-label="Back"><ArrowLeft size={16} /></button>
            <h1 className="display-lg">Edit expense</h1>
          </div>
        </div>
      </div>
      <div className="page-body" style={{ maxWidth: 600 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="title-sm" style={{ marginBottom: 20 }}>Details</h2>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Description</label>
            <input type="text" className="input" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Amount (₹)</label>
              <input type="number" min="0.01" step="0.01" className="input mono" value={amount || ''} onChange={e => setAmount(+e.target.value)} />
            </div>
            <div>
              <label className="form-label">Date</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label">Paid by</label>
            <select className="input" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              {members.map(m => { const u = m.users as any; return <option key={m.user_id} value={m.user_id}>{u?.full_name}</option> })}
            </select>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="title-sm" style={{ marginBottom: 16 }}>Split type</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {(['equal', 'exact', 'percentage', 'shares'] as SplitMechanism[]).map((t) => (
              <button key={t} type="button" onClick={() => setSplitType(t)} style={{
                padding: '10px 8px', borderRadius: 'var(--radius-md)',
                border: splitType === t ? '2px solid var(--color-primary)' : '1px solid var(--color-hairline)',
                background: splitType === t ? 'rgba(245,78,0,0.04)' : 'var(--color-surface-card)',
                cursor: 'pointer', fontSize: 13, fontWeight: 500, color: splitType === t ? 'var(--color-primary)' : 'var(--color-ink)',
              }}>
                {t === 'equal' ? '÷ Equal' : t === 'exact' ? '₹ Exact' : t === 'percentage' ? '% Percent' : '⊛ Shares'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {participants.map((p) => (
              <div key={p.userId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 'var(--radius-md)', background: p.included ? 'var(--color-canvas-soft)' : 'transparent',
                border: '1px solid var(--color-hairline)',
              }}>
                <input type="checkbox" checked={p.included} onChange={e => setParticipants(prev => prev.map(pp => pp.userId === p.userId ? { ...pp, included: e.target.checked } : pp))} style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{p.name}</span>
                {splitType !== 'equal' && p.included && (
                  <input type="number" min="0" step={splitType === 'shares' ? '1' : '0.01'} value={p.value}
                    onChange={e => setParticipants(prev => prev.map(pp => pp.userId === p.userId ? { ...pp, value: +e.target.value } : pp))}
                    style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-hairline)', fontSize: 14, textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
                )}
                {splitType === 'equal' && p.included && amount > 0 && (
                  <span className="caption mono">{formatCurrency(amount / included.length)}</span>
                )}
              </div>
            ))}
          </div>
          {splitError && <p className="form-error" style={{ marginTop: 10 }}>{splitError}</p>}
        </div>

        {serverError && <div style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 14, marginBottom: 16 }}>{serverError}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary">Cancel</button>
          <button onClick={onSubmit} className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}
