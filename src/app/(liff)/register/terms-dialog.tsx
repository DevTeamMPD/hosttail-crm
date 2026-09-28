'use client'

import { Fragment, useEffect, useRef, useState, type UIEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  body: string
  onAccept: () => void
}

/** Minimal renderer for the small markdown subset the terms document uses (#/##/** bold**). */
function renderBody(body: string) {
  return body.split('\n').map((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('## ')) {
      return (
        <h4 key={i} className="mt-4 mb-1 text-sm font-semibold" style={{ color: 'var(--ht-accent)' }}>
          {trimmed.slice(3)}
        </h4>
      )
    }
    if (trimmed.startsWith('# ')) {
      return (
        <h3 key={i} className="mb-2 text-base font-bold" style={{ color: 'var(--ht-primary)' }}>
          {trimmed.slice(2)}
        </h3>
      )
    }
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g)
    return (
      <p key={i} className="mb-2 text-sm leading-relaxed text-gray-700">
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? (
            <strong key={j}>{p.slice(2, -2)}</strong>
          ) : (
            <Fragment key={j}>{p}</Fragment>
          )
        )}
      </p>
    )
  })
}

/**
 * The accept button stays disabled until the customer has scrolled within
 * 40px of the bottom -- preserved from the legacy page's "must actually
 * read it" pattern (index.html checkTermsScroll()), a UX choice worth
 * keeping even though everything else about the modal was rebuilt.
 */
export function TermsDialog({ open, onOpenChange, body, onAccept }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  function checkEnd(el: HTMLDivElement) {
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolledToEnd(true)
  }

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    checkEnd(e.currentTarget)
  }

  // A screen tall enough to show the whole document never fires onScroll,
  // which would leave the button disabled forever.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => bodyRef.current && checkEnd(bodyRef.current))
    return () => cancelAnimationFrame(id)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bottom sheet, as in legacy/index.html. dvh, not vh: in LINE's in-app
          browser vh includes the area behind the bottom toolbar, which pushed
          the accept button off-screen. min-h-0 lets the body shrink and scroll
          instead of overflowing the sheet. */}
      <DialogContent
        className="top-auto bottom-0 flex max-h-[75vh] max-w-[480px] translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none bg-white p-0 text-gray-900 supports-[height:100dvh]:max-h-[75dvh] sm:max-w-[480px] data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>เงื่อนไขการรับประกันสินค้า</DialogTitle>
        </DialogHeader>
        <div ref={bodyRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {renderBody(body)}
        </div>
        <div className="shrink-0 border-t px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {!scrolledToEnd && <p className="mb-2 text-center text-xs text-gray-400">เลื่อนอ่านจนจบเพื่อกดยอมรับ</p>}
          <Button
            type="button"
            disabled={!scrolledToEnd}
            onClick={() => {
              onAccept()
              onOpenChange(false)
            }}
            className="w-full text-white"
            style={{ background: scrolledToEnd ? 'var(--ht-primary)' : undefined }}
          >
            ยอมรับเงื่อนไข
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
