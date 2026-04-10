import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Toaster } from '@/components/ui/sonner'
import { Providers } from '@/components/providers'

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
  description: 'E-books, community, sweepstakes — everything you need to build.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
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
      <body className="min-h-screen flex flex-col antialiased">
        <Providers>
          {/* Phase 4A: multiplier banner slot */}
          <div id="multiplier-banner-slot" />
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
