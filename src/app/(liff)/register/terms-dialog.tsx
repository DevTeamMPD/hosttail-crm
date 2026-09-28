'use client'

import { Fragment, useEffect, useRef, useState, type UIEvent } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  body: string
  onAccept: () => void
}

/** Minimal renderer for the small markdown subset the terms document uses (#/##/** bold**). */
function renderBody(body: string) {
  let section = 0
  return body.split('\n').map((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return null
    // The sheet header already carries the document title.
    if (trimmed.startsWith('# ')) return null
    if (trimmed.startsWith('## ')) {
      section += 1
      return (
        <h4
          key={i}
          data-section={section}
          className="mt-2 text-sm font-semibold text-[var(--ht-deep)] first:mt-0"
        >
          {trimmed.slice(3)}
        </h4>
      )
    }
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g)
    return (
      <p key={i} className="text-[13px] leading-[1.7] text-[#4a403a]">
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <Fragment key={j}>{p}</Fragment>
        )}
      </p>
    )
  })
}

/**
 * Bottom sheet ("Hosttail Mobile Forms", screen 02). The accept button stays
 * disabled until the customer has scrolled within 40px of the bottom -- kept
 * from the legacy page's "must actually read it" rule. The counter and bar
 * show how much is left.
 */
export function TermsDialog({ open, onOpenChange, body, onAccept }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [progress, setProgress] = useState(0)
  const [section, setSection] = useState(1)
  const bodyRef = useRef<HTMLDivElement>(null)
  const totalSections = Math.max(1, (body.match(/^\s*## /gm) ?? []).length)

  function measure(el: HTMLDivElement) {
    const max = el.scrollHeight - el.clientHeight
    setProgress(max <= 0 ? 1 : Math.min(1, el.scrollTop / max))
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolledToEnd(true)
    let current = 1
    for (const h of el.querySelectorAll<HTMLElement>('[data-section]')) {
      if (h.offsetTop - el.offsetTop <= el.scrollTop + 24) current = Number(h.dataset.section)
    }
    setSection(current)
  }

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    measure(e.currentTarget)
  }

  // A screen tall enough to show the whole document never fires onScroll,
  // which would leave the button disabled forever.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => bodyRef.current && measure(bodyRef.current))
    return () => cancelAnimationFrame(id)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* dvh, not vh: in LINE's in-app browser vh includes the area behind the
          bottom toolbar, which pushed the accept button off-screen. min-h-0
          lets the body shrink and scroll instead of overflowing the sheet. */}
      <DialogContent
        showCloseButton={false}
        className="top-auto bottom-0 flex h-[78vh] max-w-[480px] translate-y-0 flex-col gap-0 rounded-t-3xl rounded-b-none bg-white p-0 text-[var(--ht-ink)] ring-0 supports-[height:100dvh]:h-[78dvh] sm:max-w-[480px] data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-sm bg-[#e3dbd3]" />
        </div>
        <div className="flex items-center justify-between border-b border-[var(--ht-divider)] px-[22px] pt-3 pb-3.5">
          <DialogTitle className="text-[17px] font-semibold">เงื่อนไขการรับประกันสินค้า</DialogTitle>
          <span className="font-ht-mono text-[11px] font-medium text-[var(--ht-text-4)]">
            {section} / {totalSections}
          </span>
        </div>
        <div className="h-[3px] bg-[var(--ht-divider)]">
          <div className="h-[3px] bg-[var(--ht-primary)] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div
          ref={bodyRef}
          onScroll={handleScroll}
          className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-[22px] py-4"
        >
          {renderBody(body)}
        </div>
        <div className="shrink-0 border-t border-[var(--ht-divider)] px-[22px] pt-3 pb-[calc(18px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!scrolledToEnd}
            onClick={() => {
              onAccept()
              onOpenChange(false)
            }}
            className="flex h-[52px] w-full items-center justify-center rounded-2xl text-base font-semibold transition"
            style={
              scrolledToEnd
                ? { background: 'var(--ht-primary)', color: '#fff' }
                : { background: 'var(--ht-divider)', color: 'var(--ht-text-4)' }
            }
          >
            {scrolledToEnd ? 'ยอมรับเงื่อนไข' : 'เลื่อนอ่านจนจบเพื่อยอมรับ'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
