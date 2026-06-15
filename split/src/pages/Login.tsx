import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../supabaseClient'
import { Wallet, Eye, EyeOff, FlaskConical } from 'lucide-react'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

const TEST_EMAIL = 'haswanthgoud@gmail.com'
const TEST_PASSWORD = 'Haswanth@123'

export function Login() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const fillTestCredentials = () => {
    setValue('email', TEST_EMAIL, { shouldValidate: true })
    setValue('password', TEST_PASSWORD, { shouldValidate: true })
  }

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    if (error) {
      setServerError(error.message)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-canvas)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Wallet size={22} color="#fff" />
          </div>
          <h1 className="display-lg" style={{ marginBottom: 6 }}>Welcome back</h1>
          <p className="body-sm text-muted">Sign in to your SplitApp account</p>
        </div>

        {/* Form Card */}
        <div className="card" style={{ padding: '28px 28px' }}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" htmlFor="login-password" style={{ margin: 0 }}>Password</label>
                <Link
                  to="/forgot-password"
                  style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}
                >
                  Forgot?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  className={`input ${errors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-muted)', display: 'flex',
                  }}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
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

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="body-sm text-muted" style={{ textAlign: 'center', marginTop: 20 }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--color-ink)', fontWeight: 500, textDecoration: 'none' }}>
            Sign up
          </Link>
        </p>

        {/* Test Credentials */}
        <div style={{
          marginTop: 20,
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-border)',
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--color-muted)' }}>
            <FlaskConical size={14} />
            <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>TEST CREDENTIALS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--color-ink)', fontFamily: 'monospace' }}>
            <span>📧 {TEST_EMAIL}</span>
            <span>🔑 {TEST_PASSWORD}</span>
          </div>
          <button
            type="button"
            onClick={fillTestCredentials}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '7px 0',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-primary)',
              background: 'transparent',
              color: 'var(--color-primary)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary)'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'
            }}
          >
            Use test credentials
          </button>
        </div>
      </div>
    </div>
  )
}
