import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatDate, formatRelativeTime, getInitials } from '../utils/formatters'
import { ArrowLeft, Edit2, Trash2, Send, MessageCircle } from 'lucide-react'
import type { ExpenseComment } from '../types'

export function ExpenseDetail() {
  const { id: groupId, eid } = useParams<{ id: string; eid: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [comments, setComments] = useState<ExpenseComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { data: expense, isLoading } = useQuery({
    queryKey: ['expense', eid],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select(`
          *,
          payer:users!paid_by(id, full_name, email),
          expense_splits(user_id, owed_share, share_units, users(id, full_name, email))
        `)
        .eq('id', eid!)
        .single()
      return data
    },
    enabled: !!eid,
  })

  // Load initial comments
  useEffect(() => {
    if (!eid) return
    supabase
      .from('expense_comments')
      .select('*, users(id, full_name, email)')
      .eq('expense_id', eid)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setComments(data as ExpenseComment[])
      })
  }, [eid])

  // Real-time subscription
  useEffect(() => {
    if (!eid) return
    const channel = supabase
      .channel(`expense-chat:${eid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'expense_comments',
        filter: `expense_id=eq.${eid}`,
      }, async (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const { data: userProfile } = await supabase
            .from('users').select('id, full_name, email').eq('id', payload.new.user_id).single()
          setComments((prev) => [...prev, { ...payload.new, users: userProfile }])
        } else if (payload.eventType === 'UPDATE') {
          setComments((prev) => prev.map((c) => c.id === payload.new.id ? { ...c, ...payload.new } : c))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [eid])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const sendComment = async () => {
    if (!commentText.trim() || !user || !eid) return
    setSendingComment(true)
    await supabase.from('expense_comments').insert({
      expense_id: eid,
      user_id: user.id,
      content: commentText.trim(),
    })
    setCommentText('')
    setSendingComment(false)
  }

  const deleteComment = async (commentId: string) => {
    await supabase.from('expense_comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId)
  }

  const softDeleteExpense = async () => {
    if (!confirm('Delete this expense? This cannot be undone.')) return
    await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', eid!)
    qc.invalidateQueries({ queryKey: ['group', groupId] })
    navigate(`/groups/${groupId}`)
  }

  if (isLoading) {
    return (
      <div className="page-body">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card" style={{ marginBottom: 16 }}>
            <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 14, width: '40%' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!expense) return <div className="page-body"><p>Expense not found.</p></div>

  const payer = expense.payer as any
  const splits = expense.expense_splits || []
  const SPLIT_LABEL: Record<string, string> = { equal: 'Equal', exact: 'Exact amounts', percentage: 'Percentage', shares: 'Shares' }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(`/groups/${groupId}`)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>Expense detail</p>
              <h1 className="display-lg">{expense.description}</h1>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to={`/groups/${groupId}/expenses/${eid}/edit`} className="btn btn-secondary btn-sm" id="edit-expense-btn">
              <Edit2 size={14} />
              Edit
            </Link>
            <button onClick={softDeleteExpense} className="btn btn-danger btn-sm" id="delete-expense-btn">
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 680 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Amount card */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <p className="caption" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>Total amount</p>
            <p className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-ink)', letterSpacing: '-1px' }}>
              {formatCurrency(expense.amount)}
            </p>
          </div>
          {/* Meta card */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ marginBottom: 10 }}>
              <p className="caption" style={{ marginBottom: 2 }}>Paid by</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="avatar avatar-sm" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  {getInitials(payer?.full_name || '?')}
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{payer?.full_name || 'Unknown'}</p>
              </div>
            </div>
            <p className="caption">
              <span style={{ marginRight: 8 }}>📅 {formatDate(expense.date)}</span>
              <span className="badge">{SPLIT_LABEL[expense.split_type]}</span>
            </p>
          </div>
        </div>

        {/* Splits */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="title-sm" style={{ marginBottom: 16 }}>Split breakdown</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {splits.map((split: any) => {
              const u = split.users as any
              const isPayer = split.user_id === expense.paid_by
              return (
                <div key={split.user_id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: '1px solid var(--color-hairline-soft)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar avatar-sm">{getInitials(u?.full_name || '?')}</div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>
                        {u?.full_name || 'Unknown'}
                        {split.user_id === user?.id && ' (you)'}
                      </p>
                      {isPayer && <p className="caption" style={{ color: 'var(--color-success)' }}>Paid</p>}
                    </div>
                  </div>
                  <p className="mono" style={{ fontSize: 14, fontWeight: 600, color: isPayer ? 'var(--color-success)' : 'var(--color-ink)' }}>
                    {formatCurrency(split.owed_share)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chat thread */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <MessageCircle size={16} style={{ color: 'var(--color-muted)' }} />
            <h2 className="title-sm">Discussion</h2>
            <span className="badge">{comments.filter(c => !c.deleted_at).length}</span>
          </div>

          {/* Messages */}
          <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
            {comments.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <p className="caption">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {comments.map((c) => {
                  const author = c.users as any
                  const isMe = c.user_id === user?.id
                  const isDeleted = !!c.deleted_at

                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div className="avatar avatar-sm" style={{
                        flexShrink: 0,
                        background: isMe ? 'var(--color-primary)' : 'var(--color-surface-strong)',
                        color: isMe ? '#fff' : 'var(--color-ink)',
                      }}>
                        {getInitials(author?.full_name || '?')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>
                            {author?.full_name || 'Unknown'}
                          </span>
                          <span className="caption">{formatRelativeTime(c.created_at)}</span>
                          {isMe && !isDeleted && (
                            <button
                              onClick={() => deleteComment(c.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted-soft)', fontSize: 12 }}
                              aria-label="Delete message"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <p style={{
                          fontSize: 14, color: isDeleted ? 'var(--color-muted)' : 'var(--color-body)',
                          fontStyle: isDeleted ? 'italic' : 'normal',
                        }}>
                          {isDeleted ? 'Message deleted' : c.content}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid var(--color-hairline-soft)' }}>
            <input
              type="text"
              className="input"
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment() } }}
              maxLength={1000}
              style={{ flex: 1 }}
            />
            <button
              onClick={sendComment}
              disabled={!commentText.trim() || sendingComment}
              className="btn btn-primary btn-sm"
              aria-label="Send comment"
              style={{ flexShrink: 0 }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
