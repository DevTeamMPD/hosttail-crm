'use client'

import { useCallback, useEffect, useState } from 'react'
import { liffFetch } from '@/lib/liff/client'

export interface LedgerEntry {
  id: number
  kind: string
  points: number
  source_type: string
  note: string | null
  created_at: string
}

export interface Tier {
  code: string
  name_th: string
  min_lifetime_pts: number
  sort_order: number
}

interface PointsResponse {
  pointsBalance: number
  pointsLifetime: number
  tierCode: string | null
  tiers: Tier[]
  ledger: LedgerEntry[]
}

export function usePointsData() {
  const [data, setData] = useState<PointsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await liffFetch('/api/liff/points')
      if (!res.ok) throw new Error(`status ${res.status}`)
      setData((await res.json()) as PointsResponse)
    } catch (err) {
      console.error('[usePointsData]', err)
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

  return { data, loading, error, refresh }
}
