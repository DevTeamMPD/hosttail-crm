/**
 * Thai phone canonicalisation — the live-path normaliser.
 *
 * Handles every shape observed in the live data:
 *   '081-234-5678'   -> '0812345678'   (LIFF form, free text)
 *   '0812345678'     -> '0812345678'
 *   '+66812345678'   -> '0812345678'
 *   '660946949993'   -> '0946949993'   (order_tracking, LA_hosttail)
 *   '******60'       -> null           (order_tracking, SH_hosttail — masked)
 *
 * Returns null when the value cannot be resolved to a full Thai number.
 *
 * Deliberately does NOT guess a missing leading zero on a bare 9-digit
 * string. That repair belongs only to recoverLegacySheetPhone() below, for
 * one specific historical reason (Google Sheets numeric-coerced the legacy
 * member export and ate every leading zero). Applying it here would also
 * "fix" a genuinely mistyped number from a live customer — and this
 * normaliser backs the Facebook/LINE channel's phone-based order lookup,
 * where an over-eager repair could resolve to the wrong person's orders.
 *
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

  if (/^0[689]\d{8}$/.test(d)) return d // mobile
  if (/^0[2-7]\d{7}$/.test(d)) return d // landline
  return null
}

/**
 * Legacy-migration-only repair: Google Sheets numeric-coerced the entire
 * legacy member export, stripping the leading zero from every one of the 93
 * rows ('891332982' for what was really '0891332982'). Use this ONLY when
 * importing that specific sheet — never on live LIFF input or on any other
 * data source, where a bare 9-digit value is just wrong, not corrupted.
 */
export function recoverLegacySheetPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = String(raw).trim().replace(/[^0-9]/g, '')
  if (/^[6-9]\d{8}$/.test(d)) return normalizePhoneTh('0' + d)
  return normalizePhoneTh(raw)
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
