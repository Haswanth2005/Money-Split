/**
 * Splitting utilities — all amounts are in INR (₹)
 * Rounding rule: remainder cents always go to the payer.
 */

export interface SplitResult {
  userId: string
  owedShare: number
  shareUnits?: number
}

/** Round to 2 decimal places (paise precision) */
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Equal split — divides amount equally among participants.
 * Remainder goes to the payer.
 */
export function splitEqually(
  amount: number,
  participantIds: string[],
  payerId: string
): SplitResult[] {
  const n = participantIds.length
  if (n === 0) return []

  const base = Math.floor((amount / n) * 100) / 100
  const distributed = base * n
  const remainder = round2(amount - distributed)

  return participantIds.map((userId) => ({
    userId,
    owedShare: userId === payerId ? round2(base + remainder) : base,
  }))
}

/**
 * Exact split — each participant has a manually set share.
 * Validates that sum == amount.
 */
export function splitExact(
  shares: { userId: string; amount: number }[]
): SplitResult[] {
  return shares.map(({ userId, amount }) => ({
    userId,
    owedShare: round2(amount),
  }))
}

/**
 * Percentage split — each participant gets a percentage of the total.
 * Remainder (from rounding) goes to the payer.
 */
export function splitByPercentage(
  totalAmount: number,
  shares: { userId: string; percentage: number }[],
  payerId: string
): SplitResult[] {
  const results = shares.map(({ userId, percentage }) => ({
    userId,
    owedShare: round2((percentage / 100) * totalAmount),
  }))

  const distributed = results.reduce((sum, r) => sum + r.owedShare, 0)
  const remainder = round2(totalAmount - distributed)

  // Add remainder to payer
  return results.map((r) => ({
    ...r,
    owedShare: r.userId === payerId ? round2(r.owedShare + remainder) : r.owedShare,
  }))
}

/**
 * Share-based split — each participant is assigned N shares.
 * owed = (user_shares / total_shares) * amount
 * Remainder goes to the payer.
 */
export function splitByShares(
  totalAmount: number,
  shares: { userId: string; units: number }[],
  payerId: string
): SplitResult[] {
  const totalUnits = shares.reduce((sum, s) => sum + s.units, 0)
  if (totalUnits === 0) return []

  const results = shares.map(({ userId, units }) => ({
    userId,
    owedShare: round2((units / totalUnits) * totalAmount),
    shareUnits: units,
  }))

  const distributed = results.reduce((sum, r) => sum + r.owedShare, 0)
  const remainder = round2(totalAmount - distributed)

  return results.map((r) => ({
    ...r,
    owedShare: r.userId === payerId ? round2(r.owedShare + remainder) : r.owedShare,
  }))
}

/** Validate that an exact split sums to the total */
export function validateExactSplit(shares: number[], total: number): boolean {
  const sum = shares.reduce((a, b) => a + b, 0)
  return Math.abs(round2(sum) - round2(total)) < 0.005
}

/** Validate that percentages sum to 100 */
export function validatePercentageSplit(percentages: number[]): boolean {
  const sum = percentages.reduce((a, b) => a + b, 0)
  return Math.abs(sum - 100) < 0.01
}
