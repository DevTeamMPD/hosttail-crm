/**
 * Phone shown to a `viewer`, who can confirm which customer a support ticket
 * is about without walking away with a list of reachable numbers.
 * '0812345678' -> '081-XXX-5678'
 */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length < 9) return 'XXX-XXX-XXXX'
  return `${d.slice(0, 3)}-XXX-${d.slice(-4)}`
}
