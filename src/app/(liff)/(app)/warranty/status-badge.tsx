import { Pill, type PillTone } from '../../ui'

const REGISTRATION_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'รอตรวจสอบ', tone: 'pend' },
  active: { label: 'ประกันมีผลแล้ว', tone: 'good' },
  rejected: { label: 'ถูกปฏิเสธ', tone: 'bad' },
  attempts_exhausted: { label: 'ยื่นครบจำนวนครั้งแล้ว', tone: 'bad' },
  void: { label: 'ยกเลิก', tone: 'neutral' },
}

export function RegistrationStatusBadge({ status }: { status: string }) {
  const meta = REGISTRATION_STATUS[status] ?? { label: status, tone: 'neutral' as const }
  return <Pill tone={meta.tone}>{meta.label}</Pill>
}

/** Item status, folding in days left so "active but 3 days left" reads as urgent, not green. */
export function itemStatus(status: string, daysLeft: number | null): { label: string; tone: PillTone } {
  if (status === 'void') return { label: 'ยกเลิก', tone: 'neutral' }
  if (status === 'expired' || (daysLeft !== null && daysLeft < 0)) return { label: 'หมดประกันแล้ว', tone: 'bad' }
  if (daysLeft !== null && daysLeft <= 60) return { label: `เหลือ ${daysLeft} วัน`, tone: 'warn' }
  return { label: 'ใช้งานอยู่', tone: 'good' }
}

export function ItemStatusBadge({ status, daysLeft, small }: { status: string; daysLeft: number | null; small?: boolean }) {
  const s = itemStatus(status, daysLeft)
  return (
    <Pill tone={s.tone} small={small}>
      {s.label}
    </Pill>
  )
}
