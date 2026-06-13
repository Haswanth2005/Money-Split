import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getInitials, formatDate } from '../utils/formatters'
import { ArrowLeft, Plus, X, Trash2, UserMinus, Mail, AlertTriangle, Copy } from 'lucide-react'
import type { GroupMember, GroupInvite } from '../types'

export function GroupSettings() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['group-settings', id],
    queryFn: async () => {
      const [groupRes, membersRes, invitesRes] = await Promise.all([
        supabase.from('groups').select('*').eq('id', id).single(),
        supabase.from('group_members').select('*, users(id, email, full_name)').eq('group_id', id),
        supabase.from('group_invites').select('*').eq('group_id', id).eq('status', 'pending'),
      ])
      return {
        group: groupRes.data,
        members: (membersRes.data || []) as GroupMember[],
        invites: (invitesRes.data || []) as GroupInvite[],
      }
    },
    enabled: !!id,
  })

  const isCreator = data?.group?.created_by === user?.id

  const inviteMember = async () => {
    const email = emailInput.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email')
      return
    }

    // Check if already a member
    const alreadyMember = data?.members.some((m) => (m.users as any)?.email === email)
    if (alreadyMember) { setEmailError('Already a member'); return }

    // Check if existing user
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).single()

    if (existingUser) {
      const { error } = await supabase.from('group_members').insert({ group_id: id, user_id: existingUser.id })
      if (error) { setEmailError(error.message); return }
      showToast(`${email} added to the group`)
    } else {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('group_invites').insert({
        group_id: id, invited_by: user!.id, email, token,
        status: 'pending', expires_at: expiresAt,
      })
      if (error) { setEmailError(error.message); return }
      showToast(`Invite sent to ${email}`)
    }

    setEmailInput('')
    setEmailError('')
    refetch()
    qc.invalidateQueries({ queryKey: ['group', id] })
  }

  const removeMember = async (memberId: string, memberName: string) => {
    if (!isCreator) return
    if (!confirm(`Remove ${memberName} from this group?`)) return
    await supabase.from('group_members').delete().eq('id', memberId)
    showToast(`${memberName} removed`)
    refetch()
    qc.invalidateQueries({ queryKey: ['group', id] })
  }

  const revokeInvite = async (inviteId: string, email: string) => {
    await supabase.from('group_invites').update({ status: 'expired' }).eq('id', inviteId)
    showToast(`Invite revoked for ${email}`)
    refetch()
  }

  const deleteGroup = async () => {
    if (!confirm('Delete this group? All expenses and settlements will be permanently removed.')) return
    await supabase.from('groups').delete().eq('id', id)
    navigate('/dashboard')
  }

  if (isLoading) return <div className="page-body"><div className="skeleton" style={{ height: 200 }} /></div>
  const group = data?.group
  const members = data?.members || []
  const invites = data?.invites || []

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(`/groups/${id}`)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>{group?.name}</p>
              <h1 className="display-lg">Group settings</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 600 }}>
        {/* Members */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="title-sm" style={{ marginBottom: 20 }}>Members ({members.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {members.map((m) => {
              const memberUser = m.users as any
              const isCurrentUser = m.user_id === user?.id
              const isGroupCreator = m.user_id === group?.created_by

              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: '1px solid var(--color-hairline-soft)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="avatar avatar-md">{getInitials(memberUser?.full_name || '?')}</div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>
                        {memberUser?.full_name || 'Unknown'}
                        {isCurrentUser && <span className="badge" style={{ marginLeft: 6 }}>You</span>}
                        {isGroupCreator && <span className="badge" style={{ marginLeft: 6 }}>Admin</span>}
                      </p>
                      <p className="caption">{memberUser?.email}</p>
                    </div>
                  </div>
                  {isCreator && !isCurrentUser && (
                    <button
                      onClick={() => removeMember(m.id, memberUser?.full_name)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--color-error)' }}
                      aria-label={`Remove ${memberUser?.full_name}`}
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Invite member */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="title-sm" style={{ marginBottom: 4 }}>Invite a member</h2>
          <p className="body-sm text-muted" style={{ marginBottom: 16 }}>
            Existing users are added immediately. Others receive an invite link.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="email"
              className="input"
              placeholder="friend@example.com"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inviteMember() } }}
              style={{ flex: 1 }}
            />
            <button onClick={inviteMember} className="btn btn-secondary" style={{ flexShrink: 0 }}>
              <Plus size={16} />
              Invite
            </button>
          </div>
          {emailError && <p className="form-error" style={{ marginTop: 6 }}>{emailError}</p>}
        </div>

        {/* Pending invites */}
        {invites.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="title-sm" style={{ marginBottom: 16 }}>Pending invites</h2>
            {invites.map((inv) => (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--color-hairline-soft)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Mail size={16} style={{ color: 'var(--color-muted)' }} />
                  <div>
                    <p style={{ fontSize: 14, color: 'var(--color-ink)' }}>{inv.email}</p>
                    <p className="caption">Expires {formatDate(inv.expires_at)}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`)
                      showToast('Invite link copied!')
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 12, gap: 4, height: 28 }}
                    title="Copy invite link"
                  >
                    <Copy size={13} />
                    Copy Link
                  </button>
                  <button
                    onClick={() => revokeInvite(inv.id, inv.email)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--color-error)' }}
                    aria-label="Revoke invite"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Danger zone */}
        {isCreator && (
          <div className="card" style={{ borderColor: 'var(--color-error)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <AlertTriangle size={18} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2 className="title-sm" style={{ color: 'var(--color-error)', marginBottom: 4 }}>Danger zone</h2>
                <p className="body-sm text-muted">Deleting this group is permanent and cannot be undone.</p>
              </div>
            </div>
            <button onClick={deleteGroup} className="btn btn-danger">
              <Trash2 size={14} />
              Delete group
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
