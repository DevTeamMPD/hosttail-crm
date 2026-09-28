import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, IBM_Plex_Mono, Mitr } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Hosttail CI (Claude Design "Hosttail Mobile Forms" / "Hosttail Dashboard"):
// Mitr for all text, IBM Plex Mono for order numbers, badges and counters.
const mitr = Mitr({
  variable: '--font-mitr',
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
      className={`${geistSans.variable} ${geistMono.variable} ${mitr.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-thai">{children}</body>
    </html>
  )
}
