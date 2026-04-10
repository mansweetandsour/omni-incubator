import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-16 px-4">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>

      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 mb-8">
        {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
      </div>

      <div className="space-y-10">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Data We Collect</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            We collect information you provide directly to us, such as your name, email address,
            and payment information when you create an account or make a purchase. We also collect
            usage data, including pages visited, features used, and actions taken within the
            platform. Device information such as browser type, IP address, and operating system
            may also be collected automatically.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            We use the information we collect to provide, maintain, and improve our services;
            process transactions and send related information such as purchase confirmations;
            send promotional communications (where permitted); respond to comments and questions;
            and monitor and analyze usage patterns to improve the user experience.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Third-Party Services</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            We use the following third-party services to operate our platform: <strong>Stripe</strong> for
            payment processing; <strong>Supabase</strong> for database and authentication services;
            <strong>Resend</strong> for transactional email delivery; <strong>Beehiiv</strong> for
            newsletter management; and <strong>Rewardful</strong> for affiliate program tracking.
            Each of these providers has their own privacy policy governing the data they collect and
            process on our behalf.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Cookies and Tracking</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            We use cookies and similar tracking technologies to track activity on our service and
            hold certain information. Cookies are files with a small amount of data which may
            include an anonymous unique identifier. You can instruct your browser to refuse all
            cookies or to indicate when a cookie is being sent. However, if you do not accept
            cookies, you may not be able to use some portions of our service.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Contact Us</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            If you have any questions about this Privacy Policy or our data practices, please
            contact us at <a href="mailto:support@omniincubator.org" className="underline hover:no-underline">support@omniincubator.org</a>.
            We will respond to privacy-related inquiries within a reasonable timeframe.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-2">
            {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
          </p>
        </section>
      </div>
    </div>
  )
}
