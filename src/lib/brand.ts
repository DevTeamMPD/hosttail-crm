/**
 * Hosttail brand data shared between client and server code (channel
 * metadata, pet types). No 'server-only' import here on purpose -- both
 * the registration form (client) and the API routes (server) validate
 * against the same lists.
 */

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

export interface ChannelMeta {
  value: OrderChannel
  label: string
  icon: string
  color: string
  bg: string
  refKind: 'order_id' | 'phone'
  refLabel: string
  refPlaceholder: string
  requiresReceipt: boolean
}

export const CHANNELS: readonly ChannelMeta[] = [
  {
    value: 'shopee',
    label: 'Shopee',
    icon: '🟠',
    color: 'var(--ht-shopee)',
    bg: 'var(--ht-shopee-bg)',
    refKind: 'order_id',
    refLabel: 'หมายเลขคำสั่งซื้อ (Shopee)',
    refPlaceholder: 'เช่น 250612XXXXXXXXX',
    requiresReceipt: false,
  },
  {
    value: 'lazada',
    label: 'Lazada',
    icon: '🔵',
    color: 'var(--ht-lazada)',
    bg: 'var(--ht-lazada-bg)',
    refKind: 'order_id',
    refLabel: 'หมายเลขคำสั่งซื้อ (Lazada)',
    refPlaceholder: 'เช่น #250601XXXXXXX',
    requiresReceipt: false,
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    icon: '⚫',
    color: 'var(--ht-tiktok)',
    bg: 'var(--ht-tiktok-bg)',
    refKind: 'order_id',
    refLabel: 'หมายเลขคำสั่งซื้อ (TikTok)',
    refPlaceholder: 'เช่น 58XXXXXXXXXXXXXX',
    requiresReceipt: false,
  },
  {
    value: 'facebook',
    label: 'Facebook',
    icon: '📘',
    color: '#1877f2',
    bg: '#eaf2ff',
    refKind: 'phone',
    refLabel: 'เบอร์โทรที่ใช้สั่งซื้อ',
    refPlaceholder: 'เช่น 0812345678',
    requiresReceipt: false,
  },
  {
    value: 'line',
    label: 'LINE',
    icon: '💬',
    color: 'var(--ht-line)',
    bg: '#e8fbe8',
    refKind: 'phone',
    refLabel: 'เบอร์โทรที่ใช้สั่งซื้อ',
    refPlaceholder: 'เช่น 0812345678',
    requiresReceipt: false,
  },
  {
    value: 'homepro',
    label: 'HomePro',
    icon: '🏪',
    color: 'var(--ht-homepro)',
    bg: 'var(--ht-homepro-bg)',
    refKind: 'order_id',
    refLabel: 'เลขที่ใบเสร็จ (HomePro)',
    refPlaceholder: 'เช่น INV-2025-00123',
    requiresReceipt: true,
  },
  {
    value: 'makropro',
    label: 'Makro Pro',
    icon: '🏪',
    color: 'var(--ht-makro)',
    bg: 'var(--ht-homepro-bg)',
    refKind: 'order_id',
    refLabel: 'เลขที่ใบเสร็จ (Makro Pro)',
    refPlaceholder: 'เช่น INV-2025-00123',
    requiresReceipt: true,
  },
  {
    value: 'receipt',
    label: 'ใบเสร็จ',
    icon: '🧾',
    color: 'var(--ht-accent)',
    bg: '#fff0e8',
    refKind: 'order_id',
    refLabel: 'เลขที่ใบเสร็จ',
    refPlaceholder: 'เช่น INV-2025-00123',
    requiresReceipt: true,
  },
]

export function channelMeta(channel: string): ChannelMeta {
  const found = CHANNELS.find((c) => c.value === channel)
  if (!found) throw new Error(`unknown channel: ${channel}`)
  return found
}

export const PET_TYPES = [
  { value: 'dog', label: 'สุนัข' },
  { value: 'cat', label: 'แมว' },
  { value: 'rabbit', label: 'กระต่าย' },
  { value: 'bird', label: 'นก' },
  { value: 'reptile', label: 'เลื้อยคลาน' },
  { value: 'fish', label: 'ปลา' },
  { value: 'hamster', label: 'แฮมสเตอร์' },
  { value: 'turtle', label: 'เต่า' },
  { value: 'other', label: 'อื่นๆ' },
] as const

export type PetType = (typeof PET_TYPES)[number]['value']
export const PET_TYPE_VALUES = PET_TYPES.map((p) => p.value) as PetType[]
