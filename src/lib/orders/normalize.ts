/**
 * Canonical key for a customer-entered order reference.
 *
 * Observed shapes in the legacy member sheet and in sales_transaction:
 *   Shopee  '26062895Y4E6RC'      alphanumeric, 14-15 chars, may start with 0
 *   Lazada  '#1103544846674574'   customers paste the leading '#'
 *   TikTok  '585964404338624391'  16-18 digits
 *   offline '283046'              5-7 digits (JST internal sequence)
 *
 * Rules: strip whitespace and zero-width chars, strip a leading '#',
 * uppercase, drop interior spaces/dashes. Leading zeros are NEVER stripped —
 * Shopee ids are strings, not numbers.
 *
 * NOTE: keep in sync with the SQL function ht_norm_order_key().
 */
export function normalizeOrderKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw)
    .replace(/[​-‍﻿]/g, '')
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
  return s || null
}

export const ORDER_CHANNELS = [
  'shopee',
  'lazada',
  'tiktok',
  'facebook',
  'line',
  'homepro',
  'makropro',
  'receipt',
] as const

export type OrderChannel = (typeof ORDER_CHANNELS)[number]

/** Channels where the customer supplies a phone number instead of an order id. */
export const PHONE_CHANNELS: readonly OrderChannel[] = ['facebook', 'line']

/** Channels that always require a receipt photo and admin approval. */
export const OFFLINE_CHANNELS: readonly OrderChannel[] = ['homepro', 'makropro', 'receipt']

export function isPhoneChannel(c: OrderChannel): boolean {
  return PHONE_CHANNELS.includes(c)
}

export function isOfflineChannel(c: OrderChannel): boolean {
  return OFFLINE_CHANNELS.includes(c)
}
