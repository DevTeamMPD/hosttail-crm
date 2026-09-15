const REGISTRATION_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'รอตรวจสอบ', color: 'var(--ht-returning)', bg: 'var(--ht-returning-bg)' },
  active: { label: 'ประกันมีผลแล้ว', color: 'var(--ht-success)', bg: 'var(--ht-success-bg)' },
  rejected: { label: 'ถูกปฏิเสธ', color: 'var(--ht-error)', bg: '#fdecea' },
  attempts_exhausted: { label: 'ยื่นครบจำนวนครั้งแล้ว', color: 'var(--ht-error)', bg: '#fdecea' },
  void: { label: 'ยกเลิก', color: '#6b7280', bg: '#f3f4f6' },
}

export function RegistrationStatusBadge({ status }: { status: string }) {
  const meta = REGISTRATION_STATUS[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span
      className="inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.label}
    </span>
  )
}

/** For a single warranty item, folding in the days-left number so "active but 3 days left" reads as urgent, not green. */
export function ItemStatusBadge({ status, daysLeft }: { status: string; daysLeft: number | null }) {
  if (status === 'void') {
    return (
      <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: '#6b7280', background: '#f3f4f6' }}>
        ยกเลิก
      </span>
    )
  }
  if (status === 'expired' || (daysLeft !== null && daysLeft < 0)) {
    return (
      <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: 'var(--ht-error)', background: '#fdecea' }}>
        หมดประกันแล้ว
      </span>
    )
  }
  if (daysLeft !== null && daysLeft <= 60) {
    return (
      <span
        className="inline-block rounded-full px-2.5 py-1 text-xs font-medium"
        style={{ color: 'var(--ht-warning)', background: 'var(--ht-warning-bg)' }}
      >
        เหลือ {daysLeft} วัน
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: 'var(--ht-success)', background: 'var(--ht-success-bg)' }}>
      ใช้งานอยู่
    </span>
  )
}
