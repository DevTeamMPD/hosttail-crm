'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { OrderChannel } from '@/lib/brand'

interface Props {
  channel: OrderChannel
}

const ONLINE_CHANNELS: readonly OrderChannel[] = ['shopee', 'lazada', 'tiktok']
const OFFLINE_CHANNELS: readonly OrderChannel[] = ['homepro', 'makropro', 'receipt']

/**
 * The legacy page promised this guide ("ดูวิธีหาเลขคำสั่งซื้อ") but only ever
 * shipped it as two ~2.5MB JPEGs (4500x4500px source) loaded eagerly at the
 * top of the page on every visit, regardless of which channel the customer
 * picked. Fixed two ways here: (1) collapsed by default and the <Image> is
 * not even mounted until expanded, so nothing downloads unless the customer
 * actually asks for it; (2) next/image serves it resized + as WebP/AVIF to
 * capable browsers automatically, instead of the raw 4500px JPEG.
 *
 * Not shown at all for facebook/line -- those channels use the customer's
 * own phone number, not an order id, so this guide doesn't apply.
 */
export function GuideAccordion({ channel }: Props) {
  const [open, setOpen] = useState(false)

  const isOnline = ONLINE_CHANNELS.includes(channel)
  const isOffline = OFFLINE_CHANNELS.includes(channel)
  if (!isOnline && !isOffline) return null

  const src = isOnline ? '/guide/order-id-online.jpg' : '/guide/order-id-offline.jpg'

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-600"
      >
        <span>
          📖 <span style={{ color: 'var(--ht-primary)' }}>วิธีค้นหาเลขคำสั่งซื้อ / เลขที่ใบเสร็จ</span>
        </span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-2">
          <Image
            src={src}
            alt="ตัวอย่างวิธีค้นหาเลขคำสั่งซื้อหรือเลขที่ใบเสร็จ"
            width={900}
            height={900}
            sizes="(max-width: 500px) 100vw, 450px"
            className="h-auto w-full rounded"
          />
        </div>
      )}
    </div>
  )
}
