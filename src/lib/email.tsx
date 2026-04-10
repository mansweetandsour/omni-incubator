// server-only — do not import in client components
import { render } from '@react-email/components'
import { Resend } from 'resend'
import { adminClient } from './supabase/admin'
import { EbookPurchaseEmail, type EbookPurchaseEmailProps } from '@/emails/ebook-purchase'
import { MembershipWelcomeEmail, type MembershipWelcomeEmailProps } from '@/emails/membership-welcome'
import { MembershipChargedEmail, type MembershipChargedEmailProps } from '@/emails/membership-charged'
import { TrialEndingEmail, type TrialEndingEmailProps } from '@/emails/trial-ending'
import { PaymentFailedEmail, type PaymentFailedEmailProps } from '@/emails/payment-failed'
import { LeadCaptureConfirmEmail, type LeadCaptureConfirmEmailProps } from '@/emails/lead-capture-confirm'
import { SampleProductConfirmEmail, type SampleProductConfirmEmailProps } from '@/emails/sample-product-confirm'

type TemplateKey =
  | 'ebook_purchase'
  | 'membership_welcome'
  | 'membership_charged'
  | 'trial_ending'
  | 'payment_failed'
  | 'lead_capture_confirm'
  | 'sample_product_confirm'

const SUBJECTS: Record<TemplateKey, string> = {
  ebook_purchase: 'Your e-book is ready to download',
  membership_welcome: 'Welcome to Omni Membership — your trial has started',
  membership_charged: 'Your Omni Membership has been renewed',
  trial_ending: 'Your free trial ends in 3 days',
  payment_failed: 'Action required — payment failed',
  lead_capture_confirm: 'Confirm your sweepstakes entry',
  sample_product_confirm: 'Confirm your email to get your free download',
}

export async function sendEmail(
  template: TemplateKey,
  to: string,
  data: Record<string, unknown>,
  userId?: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send')
    return
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@omniincubator.org'
    const subject = SUBJECTS[template]

    let html: string

    switch (template) {
      case 'ebook_purchase':
        html = await render(<EbookPurchaseEmail {...((data as unknown) as EbookPurchaseEmailProps)} />)
        break
      case 'membership_welcome':
        html = await render(<MembershipWelcomeEmail {...((data as unknown) as MembershipWelcomeEmailProps)} />)
        break
      case 'membership_charged':
        html = await render(<MembershipChargedEmail {...((data as unknown) as MembershipChargedEmailProps)} />)
        break
      case 'trial_ending':
        html = await render(<TrialEndingEmail {...((data as unknown) as TrialEndingEmailProps)} />)
        break
      case 'payment_failed':
        html = await render(<PaymentFailedEmail {...((data as unknown) as PaymentFailedEmailProps)} />)
        break
      case 'lead_capture_confirm':
        html = await render(<LeadCaptureConfirmEmail {...((data as unknown) as LeadCaptureConfirmEmailProps)} />)
        break
      case 'sample_product_confirm':
        html = await render(<SampleProductConfirmEmail {...((data as unknown) as SampleProductConfirmEmailProps)} />)
        break
      default: {
        const _exhaustive: never = template
        throw new Error(`Unknown email template: ${_exhaustive}`)
      }
    }

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    })

    if (sendError) {
      console.error('[email] Resend send error', sendError)
      return
    }

    // Log to email_log table
    await adminClient.from('email_log').insert({
      to_address: to,
      subject,
      template_key: template,
      resend_message_id: sendResult?.id ?? null,
      user_id: userId ?? null,
    })
  } catch (err) {
    console.error('[email] sendEmail error', err)
  }
}
