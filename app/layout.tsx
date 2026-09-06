import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'GOPS', description: 'Goofspiel — Game of Pure Strategy' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
