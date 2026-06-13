import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, Camera, Trash2, Plus, AlertCircle } from 'lucide-react'
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

  // Bill scanner states
  const [showScanner, setShowScanner] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scannedBill, setScannedBill] = useState<{ merchant: string; items: any[]; tax: number; grandTotal: number } | null>(null)
  const [scanError, setScanError] = useState('')
  const [itemShares, setItemShares] = useState<Record<number, string[]>>({})

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1]
        resolve(base64String)
      }
      reader.onerror = (error) => reject(error)
    })
  }

  const handleBillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setScanLoading(true)
    setScanError('')
    setScannedBill(null)

    const apiKey = localStorage.getItem('money_split_groq_api_key')
    if (!apiKey) {
      // Mock billing data
      setTimeout(() => {
        const demo = {
          merchant: "Dominos Pizza",
          items: [
            { name: "Veg Margherita Pizza", quantity: 2, unitPrice: 199, total: 398 },
            { name: "Double Cheese Margherita", quantity: 1, unitPrice: 339, total: 339 },
            { name: "Coca Cola Bottle", quantity: 3, unitPrice: 40, total: 120 },
            { name: "Garlic Breadsticks", quantity: 1, unitPrice: 139, total: 139 }
          ],
          tax: 48,
          grandTotal: 1044
        }
        setScannedBill(demo)
        // Default everyone to share all items
        const initialShares: Record<number, string[]> = {}
        const allUserIds = members.map(m => m.user_id)
        demo.items.forEach((_, idx) => {
          initialShares[idx] = [...allUserIds]
        })
        setItemShares(initialShares)
        setScanLoading(false)
      }, 1500)
      return
    }

    try {
      const base64 = await fileToBase64(file)
      const data = await scanReceiptWithGroq(base64, file.type, apiKey)
      if (data && data.items) {
        setScannedBill(data)
        const initialShares: Record<number, string[]> = {}
        const allUserIds = members.map(m => m.user_id)
        data.items.forEach((_, idx) => {
          initialShares[idx] = [...allUserIds]
        })
        setItemShares(initialShares)
      } else {
        throw new Error("Invalid bill data structure returned from AI.")
      }
    } catch (err: any) {
      setScanError(err.message || 'Failed to scan bill')
    } finally {
      setScanLoading(false)
    }
  }

  const scanReceiptWithGroq = async (base64Image: string, mimeType: string, apiKey: string) => {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: "Analyze this receipt image. Extract all items (name, quantity, unit price, total price), subtotal, tax/gst, and grand total. Return ONLY a JSON object: {\"merchant\": \"\", \"items\": [{\"name\": \"\", \"quantity\": 1, \"unitPrice\": 0.0, \"total\": 0.0}], \"tax\": 0.0, \"grandTotal\": 0.0}."
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      })
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    return JSON.parse(content);
  }

  const toggleItemShare = (itemIdx: number, userId: string) => {
    setItemShares(prev => {
      const current = prev[itemIdx] || []
      const updated = current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId]
      return { ...prev, [itemIdx]: updated }
    })
  }

  const calculateSplitsFromBill = () => {
    if (!scannedBill) return {}
    const memberTotals: Record<string, number> = {}
    members.forEach(m => { memberTotals[m.user_id] = 0 })

    scannedBill.items.forEach((item: any, itemIdx: number) => {
      const sharers = itemShares[itemIdx] || []
      if (sharers.length > 0) {
        const shareAmount = item.total / sharers.length
        sharers.forEach((uid: string) => {
          memberTotals[uid] = (memberTotals[uid] || 0) + shareAmount
        })
      }
    })

    const subtotal = scannedBill.items.reduce((sum: number, item: any) => sum + item.total, 0)
    const tax = scannedBill.tax || 0
    if (tax > 0 && subtotal > 0) {
      members.forEach(m => {
        const shareRatio = memberTotals[m.user_id] / subtotal
        memberTotals[m.user_id] += tax * shareRatio
      })
    }

    return memberTotals
  }

  const applyBillToExpense = () => {
    if (!scannedBill) return
    const splits = calculateSplitsFromBill()
    
    // Set form fields
    setValue('amount', scannedBill.grandTotal)
    setValue('description', scannedBill.merchant || 'Scanned Bill')
    setValue('split_type', 'exact')

    // Update participants state
    setParticipants(prev => prev.map(p => ({
      ...p,
      included: (splits[p.userId] || 0) > 0,
      value: +(splits[p.userId] || 0).toFixed(2)
    })))

    // Close modal
    setShowScanner(false)
    setScannedBill(null)
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
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="title-sm" style={{ marginBottom: 0 }}>Details</h2>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
              >
                <Camera size={15} /> Scan Bill
              </button>
            </div>

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

      {showScanner && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16, overflowY: 'auto'
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: 640, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', padding: 24,
            overflowY: 'auto', background: 'var(--color-canvas)',
            border: '1px solid var(--color-hairline)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 className="title-md">Scan Bill / Receipt</h3>
              <button 
                type="button" 
                onClick={() => { setShowScanner(false); setScannedBill(null); }} 
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 18 }}
              >
                ✕
              </button>
            </div>

            {/* API Warning if missing */}
            {!localStorage.getItem('money_split_groq_api_key') && !scannedBill && (
              <div style={{
                background: 'rgba(245,78,0,0.06)', border: '1px dashed var(--color-primary)',
                padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 16,
                display: 'flex', gap: 10, alignItems: 'flex-start'
              }}>
                <AlertCircle size={18} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>Demo Mode Enabled</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                    To scan real bills using AI, add a Groq API Key in Settings. For now, you can upload any image to test the parser with a demo receipt!
                  </p>
                </div>
              </div>
            )}

            {/* File Upload Box */}
            {!scannedBill && !scanLoading && (
              <div style={{
                border: '2px dashed var(--color-hairline)', borderRadius: 'var(--radius-lg)',
                padding: '40px 20px', textAlign: 'center', background: 'var(--color-surface-card)',
                cursor: 'pointer', position: 'relative'
              }}>
                <Camera size={36} style={{ color: 'var(--color-muted)', marginBottom: 12 }} />
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>
                  Take a photo or upload bill image
                </p>
                <p className="caption" style={{ marginTop: 4 }}>
                  Supports JPEG, PNG, WebP up to 10MB
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBillUpload}
                  style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    opacity: 0, cursor: 'pointer', width: '100%'
                  }}
                />
              </div>
            )}

            {/* Loading State */}
            {scanLoading && (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div style={{
                  width: 32, height: 32, border: '3px solid var(--color-hairline)',
                  borderTopColor: 'var(--color-primary)', borderRadius: '50%',
                  animation: 'spin 1s linear infinite', margin: '0 auto 16px'
                }} />
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>
                  {localStorage.getItem('money_split_groq_api_key') 
                    ? 'AI is reading your bill items…' 
                    : 'Loading demo receipt table…'}
                </p>
              </div>
            )}

            {/* Scanned Items Table & Split Allocator */}
            {scannedBill && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <p className="caption">Merchant / Shop</p>
                  <input
                    type="text"
                    className="input"
                    value={scannedBill.merchant}
                    onChange={e => setScannedBill({ ...scannedBill, merchant: e.target.value })}
                    style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}
                  />
                </div>

                <p className="form-label" style={{ marginBottom: 10 }}>Select who shared each item:</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  {scannedBill.items.map((item, idx) => {
                    const sharers = itemShares[idx] || []
                    return (
                      <div key={idx} style={{
                        border: '1px solid var(--color-hairline)',
                        borderRadius: 'var(--radius-md)', padding: 14,
                        background: 'var(--color-surface-card)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{item.name}</p>
                            <p className="caption">Qty: {item.quantity} × ₹{item.unitPrice}</p>
                          </div>
                          <p className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)' }}>
                            ₹{item.total}
                          </p>
                        </div>

                        {/* Avatars of group members */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {members.map(m => {
                            const u = m.users as any
                            const isShared = sharers.includes(m.user_id)
                            return (
                              <button
                                key={m.user_id}
                                type="button"
                                onClick={() => toggleItemShare(idx, m.user_id)}
                                style={{
                                  padding: '4px 10px', borderRadius: 20,
                                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                  border: isShared ? '1px solid var(--color-primary)' : '1px solid var(--color-hairline)',
                                  background: isShared ? 'rgba(245,78,0,0.08)' : 'var(--color-canvas)',
                                  color: isShared ? 'var(--color-primary)' : 'var(--color-muted)',
                                  transition: 'all 100ms'
                                }}
                              >
                                {u?.full_name || u?.email}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Subtotals & Taxes */}
                <div style={{
                  borderTop: '1px solid var(--color-hairline)',
                  paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6,
                  marginBottom: 24
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--color-muted)' }}>
                    <span>Tax / GST:</span>
                    <span className="mono">₹{scannedBill.tax || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
                    <span>Grand Total:</span>
                    <span className="mono">₹{scannedBill.grandTotal}</span>
                  </div>
                </div>

                {/* Confirm actions */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setScannedBill(null)}
                    className="btn btn-secondary"
                  >
                    Rescan
                  </button>
                  <button
                    type="button"
                    onClick={applyBillToExpense}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    ✓ Apply Split to Expense
                  </button>
                </div>
              </div>
            )}

            {scanError && (
              <div style={{
                background: 'var(--color-error-bg)', color: 'var(--color-error)',
                padding: '12px 14px', borderRadius: 'var(--radius-md)', fontSize: 13,
                marginTop: 16
              }}>
                {scanError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
