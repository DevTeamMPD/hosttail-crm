import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Noto_Sans_Thai } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// The legacy page used the OS default font stack, which renders Thai in
// whatever the device ships (no Thai-specific font at all). Noto Sans Thai
// is the upgrade the migration plan called for.
const notoSansThai = Noto_Sans_Thai({
  variable: '--font-noto-sans-thai',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Hosttail CRM',
  description: 'Hosttail — PET VARIETY STORE',
}

// maximum-scale=1.0 in the legacy page blocked pinch-zoom, an accessibility
// anti-pattern. Deliberately not repeated here.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansThai.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-thai">{children}</body>
    </html>
  )
}
