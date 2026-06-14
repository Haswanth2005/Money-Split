import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { X, Plus, ArrowLeft } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
})

type FormValues = z.infer<typeof schema>

export function GroupCreate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [emails, setEmails] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [emailError, setEmailError] = useState('')
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase()
    if (!e) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setEmailError('Enter a valid email address')
      return
    }
    if (emails.includes(e)) {
      setEmailError('Email already added')
      return
    }
    setEmails([...emails, e])
    setEmailInput('')
    setEmailError('')
  }

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email))
  }

  const onSubmit = async (values: FormValues) => {
    if (!user) return
    setServerError('')

    // Create group (group_type defaults to 'other' in the database)
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({ name: values.name, created_by: user.id })
      .select()
      .single()

    if (groupErr || !group) {
      setServerError(groupErr?.message || 'Failed to create group')
      return
    }

    // Add creator as member
    await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id })

    // For each email: check if existing user, else create invite
    for (const email of emails) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()

      if (existingUser) {
        await supabase.from('group_members').insert({ group_id: group.id, user_id: existingUser.id })
      } else {
        const token = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        await supabase.from('group_invites').insert({
          group_id: group.id,
          invited_by: user.id,
          email,
          token,
          status: 'pending',
          expires_at: expiresAt,
        })
        // In production, send invite email via Edge Function / email provider
        console.log(`Invite link: ${window.location.origin}/invite/${token}`)
      }
    }

    navigate(`/groups/${group.id}`)
  }

  return (
    <div className="detail-layout">
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>New group</p>
              <h1 className="display-lg">Create a group</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Group name */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 className="title-sm" style={{ marginBottom: 20 }}>Group details</h2>
            <div style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="group-name">Group name</label>
              <input
                id="group-name"
                type="text"
                className={`input ${errors.name ? 'input-error' : ''}`}
                placeholder="e.g. Goa Trip 2025"
                {...register('name')}
              />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
          </div>

          {/* Invite members */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 className="title-sm" style={{ marginBottom: 4 }}>Invite members</h2>
            <p className="body-sm text-muted" style={{ marginBottom: 16 }}>
              Existing users will be added immediately. Others will receive an invite link.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <input
                type="email"
                className="input"
                placeholder="friend@example.com"
                value={emailInput}
                onChange={(e) => { setEmailInput(e.target.value); setEmailError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                style={{ flex: 1 }}
              />
              <button type="button" onClick={addEmail} className="btn btn-secondary" style={{ flexShrink: 0 }}>
                <Plus size={16} />
                Add
              </button>
            </div>

            {emailError && <p className="form-error" style={{ marginBottom: 8 }}>{emailError}</p>}

            {emails.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {emails.map((email) => (
                  <div key={email} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--color-canvas)', border: '1px solid var(--color-hairline)',
                    borderRadius: 'var(--radius-pill)', padding: '4px 10px 4px 12px',
                    fontSize: 13,
                  }}>
                    <span style={{ color: 'var(--color-ink)' }}>{email}</span>
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', display: 'flex', padding: 2 }}
                      aria-label={`Remove ${email}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {serverError && (
            <div style={{
              background: 'var(--color-error-bg)', color: 'var(--color-error)',
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              fontSize: 14, marginBottom: 20,
            }}>
              {serverError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
