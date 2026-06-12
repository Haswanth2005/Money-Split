import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Wallet } from 'lucide-react'

export function InviteAccept() {
  const { token } = useParams<{ token: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'joining' | 'done' | 'error'>('checking')
  const [groupName, setGroupName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) return setStatus('invalid')

    const checkInvite = async () => {
      const { data, error } = await supabase
        .from('group_invites')
        .select('id, group_id, email, status, expires_at, groups(name)')
        .eq('token', token)
        .single()

      if (error || !data) return setStatus('invalid')
      if (data.status !== 'pending') {
        setStatus('invalid')
        setErrorMsg(data.status === 'accepted' ? 'This invite has already been accepted.' : 'This invite has expired.')
        return
      }
      if (new Date(data.expires_at) < new Date()) {
        setStatus('invalid')
        setErrorMsg('This invite link has expired.')
        return
      }

      const groupData = (data.groups as any) as { name: string } | null
      setGroupName(groupData?.name || 'this group')
      setStatus('valid')

      // If not logged in, redirect to signup with token in query
      if (!user) {
        navigate(`/signup?invite=${token}`, { replace: true })
        return
      }

      // Auto-join
      await joinGroup(data.group_id, data.id)
    }

    checkInvite()
  }, [token, user])

  const joinGroup = async (groupId: string, inviteId: string) => {
    setStatus('joining')
    try {
      // Add as member
      const { error: memberErr } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: user?.id })

      if (memberErr && !memberErr.message.includes('duplicate')) throw memberErr

      // Update invite status
      await supabase
        .from('group_invites')
        .update({ status: 'accepted' })
        .eq('id', inviteId)

      setStatus('done')
      setTimeout(() => navigate(`/groups/${groupId}`), 1500)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to join group')
      setStatus('error')
    }
  }

  const statusContent = {
    checking: { icon: '⏳', title: 'Checking invite…', desc: '' },
    valid: { icon: '✅', title: 'Joining group…', desc: `You're being added to ${groupName}` },
    invalid: { icon: '❌', title: 'Invalid invite', desc: errorMsg || 'This invite link is invalid or has expired.' },
    joining: { icon: '⏳', title: 'Joining…', desc: `Adding you to ${groupName}` },
    done: { icon: '🎉', title: 'Joined!', desc: `Welcome to ${groupName}. Redirecting…` },
    error: { icon: '⚠️', title: 'Something went wrong', desc: errorMsg },
  }[status]

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-canvas)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: 'var(--color-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
        }}>
          <Wallet size={22} color="#fff" />
        </div>
        <div className="card" style={{ padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>{statusContent.icon}</div>
          <h2 className="title-md" style={{ marginBottom: 8 }}>{statusContent.title}</h2>
          {statusContent.desc && <p className="body-sm text-muted">{statusContent.desc}</p>}
          {status === 'invalid' || status === 'error' ? (
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
