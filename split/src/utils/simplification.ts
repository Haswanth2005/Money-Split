import type { SimplifiedTransaction } from '../types'

export interface NetBalance {
  userId: string
  userName: string
  balance: number
}

/**
 * Greedy min-transactions (net-flow) algorithm.
 * Converts a list of net balances into the minimum set of
 * transactions needed to fully settle a group.
 *
 * positive balance = creditor (owed money)
 * negative balance = debtor (owes money)
 */
export function simplifyDebts(balances: NetBalance[]): SimplifiedTransaction[] {
  const transactions: SimplifiedTransaction[] = []

  const creditors: NetBalance[] = balances
    .filter((b) => b.balance > 0.005)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance)

  const debtors: NetBalance[] = balances
    .filter((b) => b.balance < -0.005)
    .map((b) => ({ ...b, balance: Math.abs(b.balance) }))
    .sort((a, b) => b.balance - a.balance)

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0]
    const debtor = debtors[0]

    const payment = Math.min(creditor.balance, debtor.balance)
    const roundedPayment = Math.round(payment * 100) / 100

    if (roundedPayment > 0.005) {
      transactions.push({
        fromUserId: debtor.userId,
        fromUserName: debtor.userName,
        toUserId: creditor.userId,
        toUserName: creditor.userName,
        amount: roundedPayment,
      })
    }

    creditor.balance = Math.round((creditor.balance - payment) * 100) / 100
    debtor.balance = Math.round((debtor.balance - payment) * 100) / 100

    if (creditor.balance <= 0.005) creditors.shift()
    if (debtor.balance <= 0.005) debtors.shift()
  }

  return transactions
}

/**
 * Compute raw bilateral balances for all pairs in a group.
 * Returns a map of userId -> { owing to / owed by other users }
 */
export function computeNetBalances(
  members: Array<{ id: string; name: string }>,
  expenses: Array<{ paid_by: string; splits: Array<{ user_id: string; owed_share: number }> }>,
  settlements: Array<{ paid_by: string; paid_to: string; amount: number }>
): NetBalance[] {
  const netMap: Record<string, number> = {}
  members.forEach((m) => (netMap[m.id] = 0))

  // From expenses: payer gets +owed_share from each participant
  for (const expense of expenses) {
    for (const split of expense.splits) {
      // payer receives the owed share from each participant
      if (split.user_id !== expense.paid_by) {
        netMap[expense.paid_by] = (netMap[expense.paid_by] || 0) + split.owed_share
        netMap[split.user_id] = (netMap[split.user_id] || 0) - split.owed_share
      }
    }
  }

  // From settlements: paid_by loses, paid_to gains
  for (const s of settlements) {
    netMap[s.paid_by] = (netMap[s.paid_by] || 0) + s.amount
    netMap[s.paid_to] = (netMap[s.paid_to] || 0) - s.amount
  }

  return members.map((m) => ({
    userId: m.id,
    userName: m.name,
    balance: Math.round((netMap[m.id] || 0) * 100) / 100,
  }))
}
