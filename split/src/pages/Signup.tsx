import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../supabaseClient'
import { Wallet, Eye, EyeOff } from 'lucide-react'

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type FormValues = z.infer<typeof schema>

export function Signup() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.full_name },
      },
    })

    if (error) {
      setServerError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
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
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Wallet size={22} color="#fff" />
          </div>
          <h1 className="display-lg" style={{ marginBottom: 6 }}>Create account</h1>
          <p className="body-sm text-muted">Start splitting expenses with friends</p>
        </div>

        {success ? (
          <div className="card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
            <h2 className="title-md" style={{ marginBottom: 8 }}>Account created!</h2>
            <p className="body-sm text-muted">Check your email to confirm your account. Redirecting…</p>
          </div>
        ) : (
          <div className="card" style={{ padding: '28px 28px' }}>
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="signup-name">Full name</label>
                <input
                  id="signup-name"
                  type="text"
                  className={`input ${errors.full_name ? 'input-error' : ''}`}
                  placeholder="Your full name"
                  autoComplete="name"
                  {...register('full_name')}
                />
                {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="signup-email">Email</label>
                <input
                  id="signup-email"
                  type="email"
                  className={`input ${errors.email ? 'input-error' : ''}`}
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && <p className="form-error">{errors.email.message}</p>}
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="signup-password">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="signup-password"
                    type={showPw ? 'text' : 'password'}
                    className={`input ${errors.password ? 'input-error' : ''}`}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
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

              <div style={{ marginBottom: 24 }}>
                <label className="form-label" htmlFor="signup-confirm">Confirm password</label>
                <input
                  id="signup-confirm"
                  type="password"
                  className={`input ${errors.confirm ? 'input-error' : ''}`}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  {...register('confirm')}
                />
                {errors.confirm && <p className="form-error">{errors.confirm.message}</p>}
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
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
        )}

        <p className="body-sm text-muted" style={{ textAlign: 'center', marginTop: 20 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-ink)', fontWeight: 500, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
