/**
 * Thai phone canonicalisation.
 *
 * Handles every shape observed in the live data:
 *   '081-234-5678'   -> '0812345678'   (legacy LIFF form, free text)
 *   '0812345678'     -> '0812345678'
 *   '+66812345678'   -> '0812345678'
 *   '660946949993'   -> '0946949993'   (order_tracking, LA_hosttail)
 *   '891332982'      -> '0891332982'   (legacy Google Sheet stripped the 0)
 *   '******60'       -> null           (order_tracking, SH_hosttail — masked)
 *
 * Returns null when the value cannot be resolved to a full Thai number.
 * NOTE: keep in sync with the SQL function ht_normalize_phone_th().
 */
export function normalizePhoneTh(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || s.includes('*')) return null // masked values are unusable

  let d = s.replace(/[^0-9]/g, '')
  if (!d) return null

  if (d.startsWith('0066')) d = '0' + d.slice(4)
  else if (d.startsWith('66') && d.length >= 11 && d.length <= 12) d = '0' + d.slice(2)

  // Google Sheets dropped the leading zero on the entire legacy member base:
  // every one of the 93 rows arrived as 9 digits. Restore it.
  if (d.length === 9 && /^[6-9]/.test(d)) d = '0' + d

  if (/^0[689]\d{8}$/.test(d)) return d // mobile
  if (/^0[2-7]\d{7}$/.test(d)) return d // landline
  return null
}

/** Display as 081-234-5678. Falls back to the input when unparseable. */
export function formatPhoneTh(raw: string | null | undefined): string {
  const p = normalizePhoneTh(raw)
  if (!p) return raw ?? ''
  return p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p
}

/** Mask for non-admin dashboard roles: 081-xxx-5678 */
export function maskPhoneTh(raw: string | null | undefined): string {
  const p = normalizePhoneTh(raw)
  if (!p || p.length !== 10) return '—'
  return `${p.slice(0, 3)}-xxx-${p.slice(6)}`
}
