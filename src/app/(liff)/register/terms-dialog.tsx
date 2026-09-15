'use client'

import { Fragment, useState, type UIEvent } from 'react'
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

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolledToEnd(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>เงื่อนไขการรับประกันสินค้า</DialogTitle>
        </DialogHeader>
        <div onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-4">
          {renderBody(body)}
        </div>
        <div className="border-t px-5 py-4">
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
