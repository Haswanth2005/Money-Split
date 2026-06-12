/** Format a number as INR currency string */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Format a number as compact currency (e.g. ₹1.2K) */
export function formatCurrencyCompact(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `₹${(Math.abs(amount) / 1000).toFixed(1)}K`
  }
  return `₹${Math.abs(amount).toFixed(2)}`
}

/** Format a date string to a human-readable format */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

/** Format a date string to a relative time (e.g. "2 days ago") */
export function formatRelativeTime(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}

/** Get initials from a full name */
export function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Get today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Get balance chip CSS class */
export function getBalanceClass(amount: number): string {
  if (amount > 0.005) return 'balance-chip balance-chip-positive'
  if (amount < -0.005) return 'balance-chip balance-chip-negative'
  return 'balance-chip balance-chip-zero'
}

/** Get balance label */
export function getBalanceLabel(amount: number, myPerspective = true): string {
  if (Math.abs(amount) < 0.005) return 'Settled'
  if (myPerspective) {
    return amount > 0 ? `You are owed ${formatCurrency(amount)}` : `You owe ${formatCurrency(Math.abs(amount))}`
  }
  return amount > 0 ? `Owes you ${formatCurrency(amount)}` : `You owe ${formatCurrency(Math.abs(amount))}`
}

/** Get group type icon label */
export function getGroupTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    home: '🏠',
    trip: '✈️',
    couple: '💑',
    other: '👥',
  }
  return icons[type] || '👥'
}
