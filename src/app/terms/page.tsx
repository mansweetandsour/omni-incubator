import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
}

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 px-4">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>

      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 mb-8">
        {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
      </div>

      <div className="space-y-10">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            By accessing or using Omni Incubator (&ldquo;the Service&rdquo;), you agree to be bound
            by these Terms of Service and all applicable laws and regulations. If you do not agree
            with any of these terms, you are prohibited from using or accessing the Service. These
            terms apply to all visitors, users, and others who access or use the Service.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Description of Services</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Omni Incubator provides a SaaS membership platform offering access to premium e-books,
            sweepstakes entries, a service marketplace, and related community resources. Features
            and pricing are subject to change. We reserve the right to modify, suspend, or
            discontinue any aspect of the Service at any time with reasonable notice.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Membership Terms</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Paid memberships begin with a 7-day free trial. No credit card charge occurs until the
            trial period ends. Billing occurs automatically on a monthly or annual basis depending
            on the plan selected. You may cancel your membership at any time from your profile
            settings, and cancellation takes effect at the end of the current billing period.
            Switching between monthly and annual plans is permitted and will be prorated accordingly.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. E-book License</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Upon purchase, you are granted a personal, non-commercial, non-transferable license to
            access and read the purchased e-book for your own personal use. You may not reproduce,
            distribute, sell, sublicense, or create derivative works from any e-book content without
            express written permission. All intellectual property rights in the e-books remain with
            their respective authors and publishers.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Refund Policy</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Membership fees are non-refundable except where required by applicable law. E-book
            purchases are final and non-refundable once the download has been accessed, except in
            cases of technical failure or duplicate charges. If you believe you have been charged
            in error, please contact support@omniincubator.org within 30 days of the charge.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Limitation of Liability</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            To the maximum extent permitted by applicable law, Omni Incubator shall not be liable
            for any indirect, incidental, special, consequential, or punitive damages, including
            without limitation, loss of profits, data, goodwill, or other intangible losses,
            resulting from your access to or use of (or inability to access or use) the Service.
            Our total liability for any claims arising under these Terms shall not exceed the amount
            you paid us in the 12 months preceding the claim.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>
      </div>
    </div>
  )
}
