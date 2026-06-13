import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
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
import { Help } from './pages/Help'
import { getInitials } from './utils/formatters'
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Plus,
  Wallet,
  Home,
  UserCircle2,
  Pin,
  ChevronLeft,
  Menu,
  User,
  HelpCircle,
  ChevronRight,
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
function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('splitapp-pinned-groups')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Fetch all groups the user is part of
  const { data: groups = [] } = useQuery({
    queryKey: ['sidebar-groups', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data } = await supabase
        .from('group_members')
        .select('groups(id, name)')
        .eq('user_id', profile.id)
      return (data || []).map((r: any) => r.groups).filter(Boolean) as { id: string; name: string }[]
    },
    enabled: !!profile?.id,
  })

  const togglePin = (groupId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPinnedIds((prev) => {
      const next = prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
      localStorage.setItem('splitapp-pinned-groups', JSON.stringify(next))
      return next
    })
  }

  const pinnedGroups = groups.filter((g) => pinnedIds.includes(g.id))
  const unpinnedGroups = groups.filter((g) => !pinnedIds.includes(g.id))

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ThemeToggle />
            <button
              onClick={onCollapse}
              className="theme-toggle"
              style={{ border: 'none' }}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
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

        {/* Pinned Groups Section */}
        {pinnedGroups.length > 0 && (
          <>
            <div className="nav-section-label" style={{ marginTop: 8 }}>Pinned</div>
            {pinnedGroups.map((g) => (
              <NavLink
                key={g.id}
                to={`/groups/${g.id}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ justifyContent: 'space-between', paddingRight: 8 }}
              >
                <span className="truncate" style={{ flex: 1 }}>{g.name}</span>
                <button
                  onClick={(e) => togglePin(g.id, e)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-primary)', display: 'flex', padding: 4,
                  }}
                  title="Unpin group"
                >
                  <Pin size={12} fill="var(--color-primary)" />
                </button>
              </NavLink>
            ))}
          </>
        )}

        {/* All/Other Groups Section */}
        {unpinnedGroups.length > 0 && (
          <>
            <div className="nav-section-label" style={{ marginTop: 8 }}>Groups</div>
            {unpinnedGroups.map((g) => (
              <NavLink
                key={g.id}
                to={`/groups/${g.id}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ justifyContent: 'space-between', paddingRight: 8 }}
              >
                <span className="truncate" style={{ flex: 1 }}>{g.name}</span>
                <button
                  onClick={(e) => togglePin(g.id, e)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-muted)', display: 'flex', padding: 4,
                  }}
                  title="Pin group"
                >
                  <Pin size={12} />
                </button>
              </NavLink>
            ))}
          </>
        )}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Account</div>
        <NavLink to="/account" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={16} />
          Settings
        </NavLink>
      </nav>

      <div style={{ position: 'relative', padding: '12px', borderTop: '1px solid var(--color-hairline-soft)' }}>
        {menuOpen && (
          <div className="user-dropdown-menu animate-fade-in">
            {/* Header: Profile Link */}
            <NavLink
              to="/account"
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 'var(--radius-md)', textDecoration: 'none', borderBottom: '1px solid var(--color-hairline-soft)',
                marginBottom: 4, width: '100%', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div className="avatar avatar-sm" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: 11 }}>
                  {profile ? getInitials(profile.full_name) : '…'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="body-sm text-ink truncate" style={{ fontWeight: 600, fontSize: 13, marginBottom: 1 }}>{profile?.full_name || '…'}</p>
                  <p className="caption truncate" style={{ fontSize: 11 }}>Go</p>
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-muted)' }} />
            </NavLink>

            {/* Menu Items */}
            <NavLink to="/account" onClick={() => setMenuOpen(false)} className="user-dropdown-item">
              <User size={15} style={{ color: 'var(--color-muted)' }} />
              Profile
            </NavLink>
            <NavLink to="/account" onClick={() => setMenuOpen(false)} className="user-dropdown-item">
              <Settings size={15} style={{ color: 'var(--color-muted)' }} />
              Settings
            </NavLink>
            <NavLink to="/help" onClick={() => setMenuOpen(false)} className="user-dropdown-item">
              <HelpCircle size={15} style={{ color: 'var(--color-muted)' }} />
              Help
            </NavLink>
            <button
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="user-dropdown-item"
              style={{ color: 'var(--color-error)' }}
            >
              <LogOut size={15} style={{ color: 'var(--color-error)' }} />
              Log out
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="user-profile-btn"
          aria-expanded={menuOpen}
          aria-label="User menu"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div className="avatar avatar-sm" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: 11 }}>
              {profile ? getInitials(profile.full_name) : '…'}
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="body-sm text-ink truncate" style={{ fontWeight: 600, fontSize: 13, marginBottom: 1 }}>{profile?.full_name || '…'}</p>
              <p className="caption truncate" style={{ fontSize: 11 }}>Go</p>
            </div>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--color-muted)', transform: menuOpen ? 'rotate(-90deg)' : 'none', transition: 'transform 120ms' }} />
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile Bottom Navigation ──────────────────────────────────────────────────
// (No changes to MobileBottomNav)
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      <Sidebar onCollapse={() => setCollapsed(true)} />
      <main className="main-content" style={collapsed ? { paddingLeft: 48 } : {}}>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="desktop-toggle-btn"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <Menu size={16} />
          </button>
        )}
        <div className="main-content-container">
          {children}
        </div>
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
      <Route path="/help" element={
        <ProtectedRoute>
          <AppShell><Help /></AppShell>
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
