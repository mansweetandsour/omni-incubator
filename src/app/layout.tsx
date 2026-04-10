import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Omni Incubator',
  description: 'Your membership platform for e-books, sweepstakes, and more.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Rewardful affiliate tracking */}
        {process.env.NEXT_PUBLIC_REWARDFUL_API_KEY && (
          <script
            async
            src="https://r.wdfl.co/rw.js"
            data-rewardful={process.env.NEXT_PUBLIC_REWARDFUL_API_KEY}
          />
        )}
      </head>
      <body className="flex min-h-full flex-col">
        {/* Phase 4A: multiplier banner slot */}
        <div id="multiplier-banner-slot" />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
