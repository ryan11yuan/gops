import './globals.css'
import type { ReactNode } from 'react'
import { Inter, Source_Serif_4 } from 'next/font/google'

// Inter stands in for NotionInter; Source Serif for Lyon Text.
const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-notioninter',
  display: 'swap',
})

const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-lyon-text',
  display: 'swap',
})

export const metadata = { title: 'GOPS', description: 'Goofspiel — Game of Pure Strategy' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
