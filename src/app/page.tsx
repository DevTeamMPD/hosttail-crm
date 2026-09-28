import { redirect } from 'next/navigation'

/** The bare domain is the customer entry point (src/proxy.ts redirects it too). */
export default function Home() {
  redirect('/register')
}
