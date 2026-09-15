'use client'

import { CHANNELS, type OrderChannel } from '@/lib/brand'

interface Props {
  value: OrderChannel
  onChange: (v: OrderChannel) => void
  disabled?: boolean
}

/**
 * role="tablist" with real keyboard-focusable buttons -- the legacy page
 * used `<span onclick>` tabs, which are neither focusable nor announced as
 * tabs to a screen reader.
 */
export function ChannelTabs({ value, onChange, disabled }: Props) {
  return (
    <div role="tablist" aria-label="ช่องทางการสั่งซื้อ" className="flex flex-wrap gap-2">
      {CHANNELS.map((c) => {
        const selected = c.value === value
        return (
          <button
            key={c.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(c.value)}
            className="rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={
              selected
                ? { background: c.color, borderColor: c.color, color: '#fff' }
                : { background: c.bg, borderColor: 'transparent', color: c.color }
            }
          >
            <span aria-hidden>{c.icon}</span> {c.label}
          </button>
        )
      })}
    </div>
  )
}
