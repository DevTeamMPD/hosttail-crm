import { PET_TYPE_VALUES } from '@/lib/brand'

/**
 * The /customers filter set. Lives in the URL (shareable, survives paging)
 * and is what a saved segment stores in ht_segments.filters, so a segment
 * link is simply /customers?<these params>.
 */
export interface CustomerFilters {
  q: string
  source: string
  from: string
  to: string
  /** Pet types; see petMode for how several combine. */
  pets: string[]
  /** 'any' = has at least one of `pets`, 'all' = has every one of them. */
  petMode: 'any' | 'all'
  /** Province codes; a member matches if they are in any of them. */
  provinces: string[]
  /** A manual group (ht_segments.kind = 'manual'): only its members. */
  seg: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PETS = new Set<string>(PET_TYPE_VALUES)

function list(v: unknown): string[] {
  if (typeof v !== 'string' || !v) return []
  return [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))]
}

export function parseCustomerFilters(p: Record<string, unknown>): CustomerFilters {
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : '')
  return {
    q: str('q'),
    source: str('source'),
    from: ISO_DATE.test(str('from')) ? str('from') : '',
    to: ISO_DATE.test(str('to')) ? str('to') : '',
    pets: list(p.pet).filter((x) => PETS.has(x)),
    petMode: str('petmode') === 'all' ? 'all' : 'any',
    provinces: list(p.prov).filter((x) => /^[\w-]{1,16}$/.test(x)),
    seg: UUID.test(str('seg')) ? str('seg') : '',
  }
}

export function customerFiltersToParams(f: Partial<CustomerFilters>): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.q?.trim()) sp.set('q', f.q.trim())
  if (f.source) sp.set('source', f.source)
  if (f.from) sp.set('from', f.from)
  if (f.to) sp.set('to', f.to)
  if (f.pets?.length) {
    sp.set('pet', f.pets.join(','))
    if (f.petMode === 'all' && f.pets.length > 1) sp.set('petmode', 'all')
  }
  if (f.provinces?.length) sp.set('prov', f.provinces.join(','))
  if (f.seg) sp.set('seg', f.seg)
  return sp
}

export function hasCustomerFilter(f: CustomerFilters): boolean {
  return customerFiltersToParams(f).toString() !== ''
}
