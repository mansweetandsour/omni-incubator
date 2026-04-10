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

export interface PaymentFailedEmailProps {
  portalUrl: string
}

export function PaymentFailedEmail({ portalUrl }: PaymentFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Action required — your Omni Membership payment failed</Preview>
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
            <Heading as="h2" style={{ fontSize: '20px', color: '#dc2626' }}>
              Payment Failed — Action Required
            </Heading>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              We were unable to process your Omni Membership payment. Your account has been marked as past due.
            </Text>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              To keep your membership active, please update your payment method as soon as possible.
            </Text>
            <Text style={{ color: '#71717a', fontSize: '14px' }}>
              If payment is not updated, your membership may be suspended.
            </Text>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Button
              href={portalUrl}
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Update Payment Method
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default PaymentFailedEmail
