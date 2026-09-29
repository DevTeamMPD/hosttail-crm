const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'ร่าง', color: '#6b7280', bg: '#f3f4f6' },
  sending: { label: 'กำลังส่ง', color: 'var(--ht-returning)', bg: 'var(--ht-returning-bg)' },
  sent: { label: 'ส่งแล้ว', color: 'var(--ht-success)', bg: 'var(--ht-success-bg)' },
}

export function StatusBadge({ status, dryRun }: { status: string; dryRun?: boolean }) {
  const s = STATUS[status] ?? STATUS.draft
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: s.color, background: s.bg }}>
        {s.label}
      </span>
      {dryRun && status !== 'draft' && (
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: 'var(--ht-warning)', background: 'var(--ht-warning-bg)' }}
          title="ht_settings.broadcast.dry_run = true ตอนส่ง — ไม่ได้ส่งถึงลูกค้าจริง"
        >
          ทดลอง
        </span>
      )}
    </span>
  )
}
