import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface EbookPurchaseEmailProps {
  ebookTitle: string
  downloadUrl: string
  orderNumber: string
  totalCents: number
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function EbookPurchaseEmail({
  ebookTitle,
  downloadUrl,
  orderNumber,
  totalCents,
}: EbookPurchaseEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your e-book is ready to download — {ebookTitle}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
        <Container
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            border: '1px solid #e4e4e7',
            borderRadius: '8px',
            padding: '32px',
          }}
        >
          <Heading style={{ fontSize: '24px', color: '#18181b', marginBottom: '8px' }}>
            Omni Incubator
          </Heading>
          <Hr style={{ borderColor: '#e4e4e7', margin: '16px 0' }} />

          <Section>
            <Heading as="h2" style={{ fontSize: '20px', color: '#18181b' }}>
              Thank you for your purchase!
            </Heading>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              Your order has been confirmed. Here are the details:
            </Text>
            <Text style={{ color: '#3f3f46' }}>
              <strong>Order Number:</strong> {orderNumber}
            </Text>
            <Text style={{ color: '#3f3f46' }}>
              <strong>E-book:</strong> {ebookTitle}
            </Text>
            <Text style={{ color: '#3f3f46' }}>
              <strong>Total Paid:</strong> {formatCents(totalCents)}
            </Text>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Button
              href={downloadUrl}
              style={{
                backgroundColor: '#18181b',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Download Now
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e4e4e7', margin: '24px 0' }} />

          <Text style={{ color: '#71717a', fontSize: '14px' }}>
            You&apos;ve earned entries in the current Omni Sweepstake — check your dashboard soon.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default EbookPurchaseEmail
