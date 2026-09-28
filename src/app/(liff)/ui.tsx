import type { CSSProperties, ReactNode } from 'react'
import type { ChannelMeta } from '@/lib/brand'
import { cn } from '@/lib/utils'

/*
 * Building blocks for the LIFF app, taken from the Claude Design file
 * "Hosttail Mobile Forms". Values are the design's own (radius 20 cards,
 * 48px fields, 54px sticky CTA); colors come from the --ht-* tokens.
 */

export const CARD_SHADOW = '0 1px 2px rgba(60,30,10,0.06)'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3.5 rounded-[20px] bg-white p-[18px]', className)} style={{ boxShadow: CARD_SHADOW }}>
      {children}
    </div>
  )
}

/** "01  ข้อมูลส่วนตัว" -- mono step number in orange, then the title. */
export function SectionTitle({ num, title, aside }: { num?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {num && <span className="font-ht-mono text-[11px] font-medium text-[var(--ht-primary)]">{num}</span>}
      <span className="text-[15px] font-semibold text-[var(--ht-ink)]">{title}</span>
      {aside && <span className="ml-auto text-xs text-[var(--ht-text-4)]">{aside}</span>}
    </div>
  )
}

/** Input / select / textarea look. Focus: orange border + cream ring. */
export const fieldClass =
  'w-full rounded-xl border-[1.5px] border-[var(--ht-border)] bg-[var(--ht-field)] px-3.5 text-[15px] text-[var(--ht-ink)] outline-none transition placeholder:text-[var(--ht-text-4)] focus:border-[var(--ht-primary)] focus:bg-white focus:shadow-[0_0_0_4px_var(--ht-bg-to)] disabled:cursor-not-allowed disabled:opacity-60'

export function Field({
  label,
  hint,
  htmlFor,
  error,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] text-[var(--ht-text-2)]">
        {label}
        {hint && <span className="text-[var(--ht-text-4)]"> {hint}</span>}
      </label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[var(--ht-error)]">{children}</p>
}

/** Letter badge standing in for a channel logo ("S", "Lz", "HP"...). */
export function ChannelBadge({ meta, size = 26 }: { meta: Pick<ChannelMeta, 'mono' | 'color'>; size?: number }) {
  return (
    <span
      aria-hidden
      className="font-ht-mono flex shrink-0 items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 30 ? 10 : size >= 26 ? 8 : 6,
        background: meta.color,
        fontSize: size >= 30 ? 12 : size >= 26 ? 11 : 10,
      }}
    >
      {meta.mono}
    </span>
  )
}

export type PillTone = 'good' | 'warn' | 'pend' | 'bad' | 'neutral'

const PILL: Record<PillTone, { bg: string; fg: string }> = {
  good: { bg: 'var(--ht-success-bg)', fg: 'var(--ht-success)' },
  warn: { bg: 'var(--ht-warning-bg)', fg: 'var(--ht-warning)' },
  pend: { bg: 'var(--ht-returning-bg)', fg: 'var(--ht-returning)' },
  bad: { bg: 'var(--ht-error-bg)', fg: 'var(--ht-error)' },
  neutral: { bg: '#f3f4f6', fg: '#6b7280' },
}

export function Pill({ tone, children, small }: { tone: PillTone; children: ReactNode; small?: boolean }) {
  const c = PILL[tone]
  return (
    <span
      className={cn('shrink-0 self-start whitespace-nowrap rounded-full font-medium', small ? 'px-[9px] py-[3px] text-[11px]' : 'px-2.5 py-1 text-xs')}
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  )
}

/** Tinted note box used for pending / rejected explanations. */
export function Note({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const c = PILL[tone]
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs leading-normal" style={{ background: c.bg, color: c.fg }}>
      {children}
    </div>
  )
}

/** 22px rounded check box. Purely visual -- the clickable element wraps it. */
export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[13px] font-semibold text-white"
      style={{
        borderColor: checked ? 'var(--ht-primary)' : 'var(--ht-check-border)',
        background: checked ? 'var(--ht-primary)' : '#fff',
      }}
    >
      {checked ? '✓' : ''}
    </span>
  )
}

export const primaryButtonClass =
  'flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ht-primary)] text-base font-semibold text-white shadow-[0_10px_24px_-10px_rgba(243,110,35,0.55)] transition active:scale-[0.99] disabled:cursor-not-allowed'

/**
 * Bottom-pinned action bar: the CTA is always reachable without scrolling.
 * `aboveNav` lifts it over the bottom navigation on tab pages.
 */
export function StickyBar({ children, aboveNav }: { children: ReactNode; aboveNav?: boolean }) {
  return (
    <div
      className="fixed inset-x-0 z-10 flex justify-center"
      style={{ bottom: aboveNav ? 'calc(70px + env(safe-area-inset-bottom))' : 0 }}
    >
      <div
        className="w-full max-w-md px-4 pt-3.5"
        style={{
          paddingBottom: aboveNav ? 10 : 'calc(18px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(rgba(255,247,240,0), var(--ht-bg-from) 30%)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Short Thai date for ranges: "12 มิ.ย. 69". */
const SHORT = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
export function shortThaiDate(iso: string | null): string {
  return iso ? SHORT.format(new Date(iso)) : '—'
}

/** Pulsing placeholder block for skeleton screens. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-[#efe6de]', className)} style={style} />
}

/** Skeleton of a white card with a few text lines -- used while lists load. */
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4" style={{ boxShadow: CARD_SHADOW }}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-[34px] w-[34px] rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  )
}
