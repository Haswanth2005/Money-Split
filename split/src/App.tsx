
import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useSearchParams } from 'react-router-dom'
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
import { SettlementConfirm } from './pages/SettlementConfirm'
import { SettlementHistory } from './pages/SettlementHistory'
import { AccountSettings } from './pages/AccountSettings'
import { InviteAccept } from './pages/InviteAccept'
import { Help } from './pages/Help'
import { getInitials, formatDate } from './utils/formatters'
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Plus,
  Wallet,
  Home,
  UserCircle2,
  ChevronLeft,
  Menu,
  User,
  HelpCircle,
  ChevronRight,
  Filter,
} from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// Helpers for date calculations in local time
function getLocalDateString(dateStr: string) {
  const d = new Date(dateStr)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getLocalTodayString() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getLocalYesterdayString() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getGroupDateHeader(dateStr: string) {
  const localDate = getLocalDateString(dateStr)
  if (localDate === getLocalTodayString()) {
    return 'Today'
  }
  if (localDate === getLocalYesterdayString()) {
    return 'Yesterday'
  }
  return formatDate(dateStr)
}

// ─── Sidebar Navigation ────────────────────────────────────────────────────────
function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const searchDate = searchParams.get('date')

  // Fetch all groups the user is part of
  const { data: groups = [] } = useQuery({
    queryKey: ['sidebar-groups', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data } = await supabase
        .from('group_members')
        .select('groups(id, name, created_at)')
        .eq('user_id', profile.id)
      return (data || []).map((r: any) => r.groups).filter(Boolean) as { id: string; name: string; created_at: string }[]
    },
    enabled: !!profile?.id,
  })

  // Filter groups by date if query param is set
  const filteredGroups = searchDate
    ? groups.filter((g) => getLocalDateString(g.created_at) === searchDate)
    : groups

  // Sort groups by creation date descending
  const sortedGroups = [...filteredGroups].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Group the groups by date header label
  const grouped: { [key: string]: typeof groups } = {}
  sortedGroups.forEach((g) => {
    const header = getGroupDateHeader(g.created_at)
    if (!grouped[header]) {
      grouped[header] = []
    }
    grouped[header].push(g)
  })

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--color-hairline)',
            }}>
              <Wallet size={16} color="var(--color-on-primary)" />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-ink)', letterSpacing: '-0.5px' }}>SplitEasy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ThemeToggle />
            <button
              onClick={onCollapse}
              className="theme-toggle"
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

        {/* Date Filter Status */}
        {searchDate && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--color-canvas-soft-2)',
            border: '1px solid var(--color-hairline)',
            borderRadius: 'var(--radius-sm)',
            margin: '8px 24px 12px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <Filter size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--color-ink)', fontWeight: 500 }} className="truncate">
                {searchDate}
              </span>
            </div>
            <button
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams)
                nextParams.delete('date')
                setSearchParams(nextParams)
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-error)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Render Grouped Groups */}
        {Object.keys(grouped).length > 0 ? (
          Object.entries(grouped).map(([dateHeader, groupList]) => (
            <div key={dateHeader} style={{ marginBottom: 14 }}>
              <div className="nav-section-label" style={{ marginTop: 0, marginBottom: 4 }}>
                {dateHeader}
              </div>
              {groupList.map((g) => (
                <NavLink
                  key={g.id}
                  to={`/groups/${g.id}`}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="truncate" style={{ flex: 1 }}>{g.name}</span>
                </NavLink>
              ))}
            </div>
          ))
        ) : (
          <div style={{ padding: '12px 24px', color: 'var(--color-muted)', fontSize: 12, textAlign: 'left' }}>
            {searchDate ? 'No groups on this date' : 'No groups yet'}
          </div>
        )}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Account</div>
        <NavLink to="/account" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={16} />
          Settings
        </NavLink>
      </nav>

      <div style={{ position: 'relative', padding: '16px 24px', borderTop: '1px solid var(--color-hairline)' }}>
        {menuOpen && (
          <div className="user-dropdown-menu animate-fade-in" style={{ bottom: 'calc(100% + 12px)', left: 16, right: 16, background: 'var(--color-canvas)', border: '1px solid var(--color-hairline)', boxShadow: '0px 4px 12px rgba(0,0,0,0.1)' }}>
            {/* Header: Profile Link */}
            <NavLink
              to="/account"
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 'var(--radius-sm)', textDecoration: 'none', borderBottom: '1px solid var(--color-hairline)',
                marginBottom: 4, width: '100%', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div className="avatar avatar-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 11 }}>
                  {profile ? getInitials(profile.full_name) : '…'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="body-sm text-ink truncate" style={{ fontWeight: 600, fontSize: 13, marginBottom: 1 }}>{profile?.full_name || '…'}</p>
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-muted)' }} />
            </NavLink>

            {/* Menu Items */}
            <NavLink to="/account" onClick={() => setMenuOpen(false)} className="user-dropdown-item" style={{ color: 'var(--color-body)', borderRadius: 'var(--radius-sm)' }}>
              <User size={15} style={{ color: 'var(--color-muted)' }} />
              Profile
            </NavLink>
            <NavLink to="/account" onClick={() => setMenuOpen(false)} className="user-dropdown-item" style={{ color: 'var(--color-body)', borderRadius: 'var(--radius-sm)' }}>
              <Settings size={15} style={{ color: 'var(--color-muted)' }} />
              Settings
            </NavLink>
            <NavLink to="/help" onClick={() => setMenuOpen(false)} className="user-dropdown-item" style={{ color: 'var(--color-body)', borderRadius: 'var(--radius-sm)' }}>
              <HelpCircle size={15} style={{ color: 'var(--color-muted)' }} />
              Help
            </NavLink>
            <button
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="user-dropdown-item"
              style={{ color: 'var(--color-error)', borderRadius: 'var(--radius-sm)' }}
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
          style={{ background: 'var(--color-canvas-soft-2)', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div className="avatar avatar-sm" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', fontSize: 11 }}>
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
      <Route path="/expenses/new" element={
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
      <Route path="/groups/:id/settlements/:sid/confirm" element={
        <ProtectedRoute>
          <AppShell><SettlementConfirm /></AppShell>
        </ProtectedRoute>
      } />
      <Route path="/groups/:id/settlement-history" element={
        <ProtectedRoute>
          <AppShell><SettlementHistory /></AppShell>
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
