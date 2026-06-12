import { useTheme } from '../contexts/ThemeContext'
import { Sun, Moon } from 'lucide-react'

interface ThemeToggleProps {
  /** Show label text next to icon */
  showLabel?: boolean
}

export function ThemeToggle({ showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      id="theme-toggle-btn"
      style={showLabel ? { width: 'auto', padding: '0 12px', gap: 8 } : {}}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      {showLabel && (
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </span>
      )}
    </button>
  )
}
