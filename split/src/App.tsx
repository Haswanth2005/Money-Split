import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ThemeToggle } from './components/ThemeToggle'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { GroupCreate } from './pages/GroupCreate'
import { GroupDetail } from './pages/GroupDetail'
import { GroupSettings } from './pages/GroupSettings'
import { ExpenseCreate } from './pages/ExpenseCreate'
import { ExpenseDetail } from './pages/ExpenseDetail'
import { ExpenseEdit } from './pages/ExpenseEdit'
import { RecordSettlement } from './pages/RecordSettlement'
import { AccountSettings } from './pages/AccountSettings'
import { InviteAccept } from './pages/InviteAccept'
import { getInitials } from './utils/formatters'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Plus,
  Wallet,
  Home,
  UserCircle2,
} from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// ─── Sidebar Navigation ────────────────────────────────────────────────────────
function Sidebar() {
  const { profile, signOut } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--color-primary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={16} color="#fff" />
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-ink)' }}>SplitApp</span>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={16} />
          Dashboard
        </NavLink>
        <NavLink to="/groups/new" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Plus size={16} />
          New Group
        </NavLink>

        <div className="nav-section-label" style={{ marginTop: 8 }}>Account</div>
        <NavLink to="/account" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={16} />
          Settings
        </NavLink>
      </nav>

      <div style={{ padding: '12px 12px 16px', borderTop: '1px solid var(--color-hairline-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="avatar avatar-sm" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
            {profile ? getInitials(profile.full_name) : '…'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="body-sm text-ink truncate" style={{ fontWeight: 500 }}>{profile?.full_name || '…'}</p>
            <p className="caption truncate">{profile?.email || ''}</p>
          </div>
        </div>
        <button onClick={signOut} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}>
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile Bottom Navigation ──────────────────────────────────────────────────
function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/dashboard" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <Home size={20} />
        Home
      </NavLink>
      <NavLink to="/groups/new" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <Plus size={20} />
        New
      </NavLink>
      <NavLink to="/account" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <UserCircle2 size={20} />
        Account
      </NavLink>
    </nav>
  )
}

// ─── App Shell Layout ──────────────────────────────────────────────────────────
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  )
}

// ─── Root Router ───────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <Signup />} />
      <Route path="/invite/:token" element={<InviteAccept />} />

      {/* Protected routes with sidebar layout */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <AppShell><Dashboard /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/new" element={
        <ProtectedRoute>
          <AppShell><GroupCreate /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id" element={
        <ProtectedRoute>
          <AppShell><GroupDetail /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id/settings" element={
        <ProtectedRoute>
          <AppShell><GroupSettings /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id/expenses/new" element={
        <ProtectedRoute>
          <AppShell><ExpenseCreate /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id/expenses/:eid" element={
        <ProtectedRoute>
          <AppShell><ExpenseDetail /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id/expenses/:eid/edit" element={
        <ProtectedRoute>
          <AppShell><ExpenseEdit /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id/settle" element={
        <ProtectedRoute>
          <AppShell><RecordSettlement /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/account" element={
        <ProtectedRoute>
          <AppShell><AccountSettings /></AppShell>
        </ProtectedRoute>
      } />

      {/* Default redirects */}
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
