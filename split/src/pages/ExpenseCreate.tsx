import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft } from 'lucide-react'
import { todayISO, formatCurrency } from '../utils/formatters'
import {
  splitEqually, splitExact, splitByPercentage, splitByShares,
  validateExactSplit, validatePercentageSplit
} from '../utils/splitting'
import type { SplitMechanism, GroupMember } from '../types'

const schema = z.object({
  description: z.string().min(1, 'Description is required').max(200),
  amount: z.number().positive('Amount must be positive'),
  paid_by: z.string().min(1, 'Select who paid'),
  split_type: z.enum(['equal', 'exact', 'percentage', 'shares']),
  date: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

interface ParticipantSplit {
  userId: string
  name: string
  included: boolean
  value: number
}

export function ExpenseCreate() {
  const { id: groupId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const [splitError, setSplitError] = useState('')

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('*, users(id, email, full_name)')
        .eq('group_id', groupId!)
      return (data || []) as GroupMember[]
    },
    enabled: !!groupId,
  })

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      split_type: 'equal',
      paid_by: user?.id || '',
      date: todayISO(),
    },
  })

  const splitType = watch('split_type') as SplitMechanism
  const amount = watch('amount') || 0

  // Participants state — default all members included
  const [participants, setParticipants] = useState<ParticipantSplit[]>([])

  useEffect(() => {
    if (members.length > 0) {
      setParticipants(members.map((m) => {
        const u = m.users as any
        return { userId: m.user_id, name: u?.full_name || 'Unknown', included: true, value: 1 }
      }))
    }
  }, [members.length])

  useEffect(() => {
    // Reset values when split type changes
    const count = participants.filter((p) => p.included).length
    setParticipants((prev) => prev.map((p) => ({
      ...p,
      value: splitType === 'equal' ? 1 : splitType === 'percentage' ? (p.included ? +(100 / Math.max(count, 1)).toFixed(2) : 0) : 1
    })))
    setSplitError('')
  }, [splitType])

  const includedCount = participants.filter((p) => p.included).length
  const totalAssigned = participants.filter((p) => p.included).reduce((s, p) => s + p.value, 0)

  const validateSplit = (): boolean => {
    if (includedCount === 0) { setSplitError('Select at least one participant'); return false }
    if (splitType === 'exact' && !validateExactSplit(participants.filter(p => p.included).map(p => p.value), amount)) {
      setSplitError(`Shares must add up to ${formatCurrency(amount)}. Currently ${formatCurrency(totalAssigned)}.`)
      return false
    }
    if (splitType === 'percentage' && !validatePercentageSplit(participants.filter(p => p.included).map(p => p.value))) {
      setSplitError(`Percentages must add up to 100%. Currently ${totalAssigned.toFixed(2)}%.`)
      return false
    }
    setSplitError('')
    return true
  }

  const onSubmit = async (values: FormValues) => {
    if (!validateSplit()) return
    setServerError('')

    const included = participants.filter((p) => p.included)
    let splits: { userId: string; owedShare: number; shareUnits?: number }[] = []

    if (values.split_type === 'equal') {
      splits = splitEqually(values.amount, included.map(p => p.userId), values.paid_by)
    } else if (values.split_type === 'exact') {
      splits = splitExact(included.map(p => ({ userId: p.userId, amount: p.value })))
    } else if (values.split_type === 'percentage') {
      splits = splitByPercentage(values.amount, included.map(p => ({ userId: p.userId, percentage: p.value })), values.paid_by)
    } else {
      splits = splitByShares(values.amount, included.map(p => ({ userId: p.userId, units: p.value })), values.paid_by)
    }

    // Insert expense
    const { data: expense, error } = await supabase.from('expenses').insert({
      group_id: groupId,
      description: values.description,
      amount: values.amount,
      currency: 'INR',
      paid_by: values.paid_by,
      split_type: values.split_type,
      date: values.date,
      created_by: user?.id,
    }).select().single()

    if (error || !expense) { setServerError(error?.message || 'Failed to create expense'); return }

    // Insert splits
    const { error: splitErr } = await supabase.from('expense_splits').insert(
      splits.map((s) => ({
        expense_id: expense.id,
        user_id: s.userId,
        owed_share: s.owedShare,
        share_units: s.shareUnits ?? null,
      }))
    )

    if (splitErr) { setServerError(splitErr.message); return }
    navigate(`/groups/${groupId}/expenses/${expense.id}`)
  }

  const updateParticipant = (userId: string, field: 'included' | 'value', val: boolean | number) => {
    setParticipants((prev) => prev.map((p) => p.userId === userId ? { ...p, [field]: val } : p))
    setSplitError('')
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
              <p className="caption" style={{ marginBottom: 2 }}>Add expense</p>
              <h1 className="display-lg">New expense</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 600 }}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Basic details */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="title-sm" style={{ marginBottom: 20 }}>Details</h2>

            <div style={{ marginBottom: 18 }}>
              <label className="form-label" htmlFor="expense-desc">Description</label>
              <input id="expense-desc" type="text" className={`input ${errors.description ? 'input-error' : ''}`}
                placeholder="e.g. Dinner at Pista House" {...register('description')} />
              {errors.description && <p className="form-error">{errors.description.message}</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label className="form-label" htmlFor="expense-amount">Amount (₹)</label>
                <input id="expense-amount" type="number" min="0.01" step="0.01"
                  className={`input mono ${errors.amount ? 'input-error' : ''}`}
                  placeholder="0.00" {...register('amount', { valueAsNumber: true })} />
                {errors.amount && <p className="form-error">{errors.amount.message}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="expense-date">Date</label>
                <input id="expense-date" type="date" className="input" {...register('date')} />
              </div>
            </div>

            <div>
              <label className="form-label" htmlFor="expense-paidby">Paid by</label>
              <select id="expense-paidby" className="input" {...register('paid_by')}>
                {members.map((m) => {
                  const u = m.users as any
                  return <option key={m.user_id} value={m.user_id}>{u?.full_name || u?.email}</option>
                })}
              </select>
              {errors.paid_by && <p className="form-error">{errors.paid_by.message}</p>}
            </div>
          </div>

          {/* Split type */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="title-sm" style={{ marginBottom: 16 }}>Split type</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
              {(['equal', 'exact', 'percentage', 'shares'] as SplitMechanism[]).map((t) => (
                <button key={t} type="button"
                  onClick={() => setValue('split_type', t)}
                  style={{
                    padding: '10px 8px', borderRadius: 'var(--radius-md)',
                    border: splitType === t ? '2px solid var(--color-primary)' : '1px solid var(--color-hairline)',
                    background: splitType === t ? 'rgba(245,78,0,0.04)' : 'var(--color-surface-card)',
                    cursor: 'pointer', textAlign: 'center', fontSize: 13, fontWeight: 500,
                    color: splitType === t ? 'var(--color-primary)' : 'var(--color-ink)',
                    transition: 'all 120ms',
                  }}>
                  {t === 'equal' ? '÷ Equal' : t === 'exact' ? '₹ Exact' : t === 'percentage' ? '% Percent' : '⊛ Shares'}
                </button>
              ))}
            </div>

            {/* Participants & values */}
            <div>
              <p className="form-label" style={{ marginBottom: 12 }}>
                Participants
                {splitType === 'exact' && amount > 0 && (
                  <span style={{ fontWeight: 400, color: totalAssigned !== amount ? 'var(--color-error)' : 'var(--color-success)', marginLeft: 8 }}>
                    {formatCurrency(totalAssigned)} / {formatCurrency(amount)}
                  </span>
                )}
                {splitType === 'percentage' && (
                  <span style={{ fontWeight: 400, color: Math.abs(totalAssigned - 100) > 0.01 ? 'var(--color-error)' : 'var(--color-success)', marginLeft: 8 }}>
                    {totalAssigned.toFixed(1)}% / 100%
                  </span>
                )}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {participants.map((p) => (
                  <div key={p.userId} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: p.included ? 'var(--color-canvas-soft)' : 'transparent',
                    border: '1px solid var(--color-hairline)', transition: 'background 120ms',
                  }}>
                    <input
                      type="checkbox" id={`p-${p.userId}`}
                      checked={p.included}
                      onChange={(e) => updateParticipant(p.userId, 'included', e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', flexShrink: 0 }}
                    />
                    <label htmlFor={`p-${p.userId}`} style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--color-ink)', cursor: 'pointer' }}>
                      {p.name}{p.userId === user?.id ? ' (you)' : ''}
                    </label>

                    {splitType !== 'equal' && p.included && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {splitType === 'percentage' && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>%</span>}
                        {splitType === 'exact' && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>₹</span>}
                        {splitType === 'shares' && <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>×</span>}
                        <input
                          type="number" min="0" step={splitType === 'shares' ? '1' : '0.01'}
                          value={p.value}
                          onChange={(e) => updateParticipant(p.userId, 'value', +e.target.value)}
                          style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-hairline)', fontSize: 14, textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                        />
                        {splitType === 'shares' && amount > 0 && includedCount > 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 60, textAlign: 'right' }}>
                            {formatCurrency((p.value / participants.filter(pp => pp.included).reduce((s, pp) => s + pp.value, 0)) * amount)}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {splitType === 'equal' && p.included && amount > 0 && includedCount > 0 && (
                      <span className="caption mono">{formatCurrency(amount / includedCount)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {splitError && <p className="form-error" style={{ marginTop: 12 }}>{splitError}</p>}
          </div>

          {serverError && (
            <div style={{
              background: 'var(--color-error-bg)', color: 'var(--color-error)',
              padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 14, marginBottom: 20,
            }}>
              {serverError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
