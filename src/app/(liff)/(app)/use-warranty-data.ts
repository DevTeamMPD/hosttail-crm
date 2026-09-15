'use client'

import { useCallback, useEffect, useState } from 'react'
import { liffFetch } from '@/lib/liff/client'

export interface WarrantyRegistration {
  id: string
  channel: string
  order_ref_raw: string
  status: string
  link_status: string
  matched_order_no: string | null
  matched_amount: number | null
  submitted_at: string
  activated_at: string | null
  review_note: string | null
}

export interface WarrantyItem {
  id: string
  registration_id: string
  sku: string | null
  product_name: string | null
  quantity: number
  warranty_start: string
  warranty_end: string | null
  status: string
}

/** Backs both the Home tab's summary stats and the Warranty tab's full list -- same GET /api/liff/orders response, fetched once per tab visit. */
export function useWarrantyData() {
  const [registrations, setRegistrations] = useState<WarrantyRegistration[] | null>(null)
  const [items, setItems] = useState<WarrantyItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await liffFetch('/api/liff/orders')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json()) as { registrations: WarrantyRegistration[]; items: WarrantyItem[] }
      setRegistrations(data.registrations)
      setItems(data.items)
    } catch (err) {
      console.error('[useWarrantyData]', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetch-on-mount, same as use-liff-gate.ts -- refresh() is a network call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  return { registrations, items, loading, error, refresh }
}
