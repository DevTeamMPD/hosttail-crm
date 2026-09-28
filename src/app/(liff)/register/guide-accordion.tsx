'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { OrderChannel } from '@/lib/brand'

interface Props {
  channel: OrderChannel
}

const ONLINE_CHANNELS: readonly OrderChannel[] = ['shopee', 'lazada', 'tiktok']
const OFFLINE_CHANNELS: readonly OrderChannel[] = ['homepro', 'makropro', 'receipt', 'event']

/**
 * The legacy page promised this guide ("ดูวิธีหาเลขคำสั่งซื้อ") but only ever
 * shipped it as two ~2.5MB JPEGs (4500x4500px source) loaded eagerly at the
 * top of the page on every visit, regardless of which channel the customer
 * picked. Open by default so customers see it without hunting for it;
 * next/image serves it resized + as WebP/AVIF instead of the raw 4500px JPEG,
 * and only the image for the selected channel type is loaded.
 *
 * Not shown at all for facebook/line -- those channels use the customer's
 * own phone number, not an order id, so this guide doesn't apply.
 */
export function GuideAccordion({ channel }: Props) {
  const [open, setOpen] = useState(true)

  const isOnline = ONLINE_CHANNELS.includes(channel)
  const isOffline = OFFLINE_CHANNELS.includes(channel)
  if (!isOnline && !isOffline) return null

  const src = isOnline ? '/guide/order-id-online.jpg' : '/guide/order-id-offline.jpg'

  return (
    <div className="overflow-hidden rounded-[14px] bg-[var(--ht-bg-to)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-3 text-[13px] font-medium text-[var(--ht-deep)]"
      >
        <span>วิธีค้นหาเลขคำสั่งซื้อ / เลขที่ใบเสร็จ</span>
        <span aria-hidden className="text-[11px]">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="mx-2.5 mb-2.5 overflow-hidden rounded-[10px] bg-white">
          <Image
            src={src}
            alt="ตัวอย่างวิธีค้นหาเลขคำสั่งซื้อหรือเลขที่ใบเสร็จ"
            width={900}
            height={900}
            sizes="(max-width: 500px) 100vw, 450px"
            className="h-auto w-full"
          />
        </div>
      )}
    </div>
  )
}
