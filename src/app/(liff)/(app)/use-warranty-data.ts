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

interface WarrantyData {
  registrations: WarrantyRegistration[]
  items: WarrantyItem[]
}

// Shared across the Home and Warranty tabs for this page load: switching tabs
// shows the last result straight away and refreshes it in the background,
// instead of a blank "loading" state on every tab visit.
let cache: WarrantyData | null = null
let inflight: Promise<WarrantyData> | null = null

function load(): Promise<WarrantyData> {
  inflight ??= (async () => {
    const res = await liffFetch('/api/liff/orders')
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = (await res.json()) as WarrantyData
    cache = data
    return data
  })().finally(() => {
    inflight = null
  })
  return inflight
}

/** Drop the cache after the member's registrations change (e.g. a new submission). */
export function invalidateWarrantyData(): void {
  cache = null
}

/** Backs both the Home tab's summary stats and the Warranty tab's full list -- same GET /api/liff/orders response. */
export function useWarrantyData() {
  const [data, setData] = useState<WarrantyData | null>(() => cache)
  const [loading, setLoading] = useState(() => cache === null)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    if (!cache) setLoading(true)
    setError(false)
    try {
      setData(await load())
    } catch (err) {
      console.error('[useWarrantyData]', err)
      if (!cache) setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetch-on-mount (revalidate even when cached) -- refresh() is a network call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  return { registrations: data?.registrations ?? null, items: data?.items ?? null, loading, error, refresh }
}
