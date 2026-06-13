import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getInitials } from '../utils/formatters'
import { UserCircle2, Sun, Moon } from 'lucide-react'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  upi_id: z.string().max(100).optional().or(z.literal('')),
})

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

type ProfileValues = z.infer<typeof profileSchema>
type PasswordValues = z.infer<typeof passwordSchema>

export function AccountSettings() {
  const { profile, signOut } = useAuth()
  const qc = useQueryClient()
  const [toast, setToast] = useState('')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('money_split_gemini_api_key') || '')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { 
      full_name: profile?.full_name || '',
      upi_id: profile?.upi_id || '',
    },
  })

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  })

  const onProfileSave = async (values: ProfileValues) => {
    const { error } = await supabase
      .from('users')
      .update({ 
        full_name: values.full_name,
        upi_id: values.upi_id || null,
      })
      .eq('id', profile!.id)

    if (error) return
    qc.invalidateQueries()
    showToast('Profile updated')
  }

  const onPasswordChange = async (values: PasswordValues) => {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) return
    passwordForm.reset()
    showToast('Password changed')
  }

  const saveGeminiKey = (key: string) => {
    localStorage.setItem('money_split_gemini_api_key', key.trim())
    setGeminiKey(key.trim())
    showToast('Gemini API key saved')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <p className="caption" style={{ marginBottom: 2 }}>Settings</p>
            <h1 className="display-lg">Your account</h1>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="settings-grid">
          {/* Left Column: Profile & Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Avatar / Profile info */}
            <div className="card" style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div className="avatar avatar-lg" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 20 }}>
                  {profile ? getInitials(profile.full_name) : <UserCircle2 size={24} />}
                </div>
                <div>
                  <p className="title-sm">{profile?.full_name || '…'}</p>
                  <p className="caption">{profile?.email}</p>
                </div>
              </div>

              <h2 className="title-sm" style={{ marginBottom: 16 }}>Profile details</h2>
              <form onSubmit={profileForm.handleSubmit(onProfileSave)}>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" htmlFor="account-name">Full name</label>
                  <input id="account-name" type="text" className="input" {...profileForm.register('full_name')} />
                  {profileForm.formState.errors.full_name && (
                    <p className="form-error">{profileForm.formState.errors.full_name.message}</p>
                  )}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" htmlFor="account-upi">UPI ID (for receiving payments)</label>
                  <input id="account-upi" type="text" className="input mono" placeholder="e.g. name@upi" {...profileForm.register('upi_id')} />
                  {profileForm.formState.errors.upi_id && (
                    <p className="form-error">{profileForm.formState.errors.upi_id.message}</p>
                  )}
                </div>
                <button type="submit" className="btn btn-secondary" disabled={profileForm.formState.isSubmitting}>
                  {profileForm.formState.isSubmitting ? 'Saving…' : 'Save profile'}
                </button>
              </form>
            </div>

            {/* Password */}
            <div className="card">
              <h2 className="title-sm" style={{ marginBottom: 16 }}>Change password</h2>
              <form onSubmit={passwordForm.handleSubmit(onPasswordChange)}>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" htmlFor="account-pw">New password</label>
                  <input id="account-pw" type="password" className="input" placeholder="At least 8 characters" {...passwordForm.register('password')} />
                  {passwordForm.formState.errors.password && (
                    <p className="form-error">{passwordForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" htmlFor="account-pw-confirm">Confirm password</label>
                  <input id="account-pw-confirm" type="password" className="input" placeholder="Re-enter password" {...passwordForm.register('confirm')} />
                  {passwordForm.formState.errors.confirm && (
                    <p className="form-error">{passwordForm.formState.errors.confirm.message}</p>
                  )}
                </div>
                <button type="submit" className="btn btn-secondary" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting ? 'Updating…' : 'Change password'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Appearance & Session */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Gemini API Key */}
            <div className="card">
              <h2 className="title-sm" style={{ marginBottom: 4 }}>Gemini API Key</h2>
              <p className="body-sm text-muted" style={{ marginBottom: 16 }}>
                Add your Gemini API key to scan receipts and bills using AI. Key is stored locally in your browser.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  className="input mono"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => saveGeminiKey(geminiKey)}
                >
                  Save
                </button>
              </div>
            </div>

            {/* Appearance */}
            <AppearanceCard />

            {/* Sign out */}
            <div className="card">
              <h2 className="title-sm" style={{ marginBottom: 8 }}>Session</h2>
              <p className="body-sm text-muted" style={{ marginBottom: 16 }}>
                Sign out of your account on this device.
              </p>
              <button onClick={signOut} className="btn btn-danger">Sign out</button>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ─── Appearance Card ──────────────────────────────────────────────────────────
function AppearanceCard() {
  const [localTheme, setLocalTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('splitapp-theme')
    if (!stored) return 'system'
    return stored as 'light' | 'dark'
  })

  const applyTheme = (t: 'light' | 'dark' | 'system') => {
    setLocalTheme(t)
    if (t === 'system') {
      localStorage.removeItem('splitapp-theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else {
      localStorage.setItem('splitapp-theme', t)
      document.documentElement.setAttribute('data-theme', t)
    }
  }

  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun size={16} /> },
    { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
    { value: 'system', label: 'System', icon: <span style={{ fontSize: 14 }}>⚙️</span> },
  ]

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 className="title-sm" style={{ marginBottom: 4 }}>Appearance</h2>
      <p className="body-sm text-muted" style={{ marginBottom: 16 }}>
        Choose your preferred colour scheme.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        {options.map((opt) => {
          const isActive = localTheme === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => applyTheme(opt.value)}
              id={`theme-${opt.value}-btn`}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '14px 10px',
                borderRadius: 'var(--radius-md)',
                border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--color-hairline)',
                background: isActive ? 'rgba(245,78,0,0.06)' : 'var(--color-surface-card)',
                cursor: 'pointer',
                color: isActive ? 'var(--color-primary)' : 'var(--color-body)',
                transition: 'all 120ms',
              }}
            >
              {opt.icon}
              <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400 }}>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
