'use client'

import { CHANNEL_GROUPS, CHANNELS, type OrderChannel } from '@/lib/brand'
import { ChannelBadge } from '../ui'

interface Props {
  value: OrderChannel
  onChange: (v: OrderChannel) => void
  disabled?: boolean
  /** Smaller inline tiles, used on the "add another order" form. */
  compact?: boolean
}

/**
 * Channels grouped by how the purchase is verified -- online (order id),
 * chat (phone), store / event (receipt photo) -- so the group header tells
 * the customer what they will be asked for before they pick.
 */
export function ChannelTabs({ value, onChange, disabled, compact }: Props) {
  return (
    <div className="flex flex-col gap-4" role="radiogroup" aria-label="ช่องทางการสั่งซื้อ">
      {CHANNEL_GROUPS.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-[var(--ht-ink)]">{g.title}</span>
            <span className="text-[var(--ht-text-4)]">{g.hint}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.filter((c) => c.group === g.key).map((c) => {
              const selected = c.value === value
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => onChange(c.value)}
                  className={
                    compact
                      ? 'flex items-center gap-2 rounded-xl border-[1.5px] p-[9px] text-left transition disabled:opacity-50'
                      : 'flex min-h-[72px] flex-col items-start gap-2 rounded-[14px] border-[1.5px] p-2.5 text-left transition disabled:opacity-50'
                  }
                  style={{ borderColor: selected ? c.color : 'var(--ht-border)', background: selected ? c.bg : '#fff' }}
                >
                  <ChannelBadge meta={c} size={compact ? 22 : 26} />
                  <span className={`${compact ? 'text-xs' : 'text-[13px]'} font-medium leading-tight text-[var(--ht-ink)]`}>
                    {c.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
