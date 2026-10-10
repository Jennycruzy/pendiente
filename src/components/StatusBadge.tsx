import type { Copy } from '../lib/i18n'
import type { MealStatus } from '../lib/types'

export function StatusBadge({ status, copy }: { status: MealStatus; copy: Copy }) {
  const label = status === 'Waiting' ? copy.waiting : status === 'Served' ? copy.served : copy.returned
  return <span className={`status-badge status-${status.toLowerCase()}`}>{label}</span>
}
