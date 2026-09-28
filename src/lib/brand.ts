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
  'event',
] as const

export type OrderChannel = (typeof ORDER_CHANNELS)[number]

export type ChannelGroup = 'online' | 'chat' | 'store'

export interface ChannelMeta {
  value: OrderChannel
  label: string
  /** Letter badge shown instead of an emoji (Hosttail Mobile Forms design). */
  mono: string
  /** @deprecated emoji icon, kept for back-office lists that still print it. */
  icon: string
  color: string
  bg: string
  group: ChannelGroup
  refKind: 'order_id' | 'phone'
  refLabel: string
  refPlaceholder: string
  requiresReceipt: boolean
}

/** Channel groups, by how the purchase is verified. Order matches the form. */
export const CHANNEL_GROUPS: readonly { key: ChannelGroup; title: string; hint: string }[] = [
  { key: 'online', title: 'ร้านค้าออนไลน์', hint: 'กรอกเลขคำสั่งซื้อ' },
  { key: 'chat', title: 'สั่งผ่านแชท', hint: 'ยืนยันด้วยเบอร์โทร' },
  { key: 'store', title: 'หน้าร้าน / Event', hint: 'แนบรูปใบเสร็จ' },
]

export const CHANNELS: readonly ChannelMeta[] = [
  {
    value: 'shopee',
    label: 'Shopee',
    mono: 'S',
    icon: '🟠',
    color: '#ee4d2d',
    bg: '#fff0ee',
    group: 'online',
    refKind: 'order_id',
    refLabel: 'หมายเลขคำสั่งซื้อ (Shopee)',
    refPlaceholder: 'เช่น 250612XXXXXXXXX',
    requiresReceipt: false,
  },
  {
    value: 'lazada',
    label: 'Lazada',
    mono: 'Lz',
    icon: '🔵',
    color: '#0f146d',
    bg: '#eef0ff',
    group: 'online',
    refKind: 'order_id',
    refLabel: 'หมายเลขคำสั่งซื้อ (Lazada)',
    refPlaceholder: 'เช่น #250601XXXXXXX',
    requiresReceipt: false,
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    mono: 'T',
    icon: '⚫',
    color: '#111111',
    bg: '#f5f5f5',
    group: 'online',
    refKind: 'order_id',
    refLabel: 'หมายเลขคำสั่งซื้อ (TikTok)',
    refPlaceholder: 'เช่น 58XXXXXXXXXXXXXX',
    requiresReceipt: false,
  },
  {
    value: 'facebook',
    label: 'Facebook',
    mono: 'f',
    icon: '📘',
    color: '#1877f2',
    bg: '#eaf2ff',
    group: 'chat',
    refKind: 'phone',
    refLabel: 'เบอร์โทรที่ใช้สั่งซื้อ',
    refPlaceholder: '',
    requiresReceipt: false,
  },
  {
    value: 'line',
    label: 'LINE',
    mono: 'L',
    icon: '💬',
    color: '#00b900',
    bg: '#e8fbe8',
    group: 'chat',
    refKind: 'phone',
    refLabel: 'เบอร์โทรที่ใช้สั่งซื้อ',
    refPlaceholder: '',
    requiresReceipt: false,
  },
  {
    value: 'homepro',
    label: 'HomePro',
    mono: 'HP',
    icon: '🏪',
    color: '#2e7d32',
    bg: '#e8f5e9',
    group: 'store',
    refKind: 'order_id',
    refLabel: 'เลขที่ใบเสร็จ (HomePro)',
    refPlaceholder: 'เช่น INV-2025-00123',
    requiresReceipt: true,
  },
  {
    value: 'makropro',
    label: 'Makro Pro',
    mono: 'MK',
    icon: '🏪',
    color: '#1b5e20',
    bg: '#e8f5e9',
    group: 'store',
    refKind: 'order_id',
    refLabel: 'เลขที่ใบเสร็จ (Makro Pro)',
    refPlaceholder: 'เช่น INV-2025-00123',
    requiresReceipt: true,
  },
  {
    // Brand receipts from trade shows (Event Pet Expo, Event BBB, ...). These
    // do exist in sales_transaction (project Head-Office, customer_group1
    // 'Event'), so the admin approves against the real bill -- see
    // resolveByOrderRef's 'event' scope.
    value: 'event',
    label: 'งาน Event',
    mono: 'EV',
    icon: '🎪',
    color: '#6a1b9a',
    bg: '#f3e5f5',
    group: 'store',
    refKind: 'order_id',
    refLabel: 'เลขที่ใบเสร็จ (งาน Event)',
    refPlaceholder: 'เช่น 901520260502-0009 หรือ 267122',
    requiresReceipt: true,
  },
  {
    value: 'receipt',
    label: 'ใบเสร็จ',
    mono: '฿',
    icon: '🧾',
    color: '#c9561a',
    bg: '#fff1e7',
    group: 'store',
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
