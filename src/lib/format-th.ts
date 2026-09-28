const THAI_DATE = new Intl.DateTimeFormat('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })

export function formatThaiDate(iso: string | null): string {
  if (!iso) return '—'
  return THAI_DATE.format(new Date(iso))
}

/** Whole days from now until `iso` (midnight-to-midnight, not time-of-day sensitive) -- negative once past. */
export function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}
