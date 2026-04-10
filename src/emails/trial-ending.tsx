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

export interface TrialEndingEmailProps {
  trialEndDate: string
  portalUrl: string
}

export function TrialEndingEmail({ trialEndDate, portalUrl }: TrialEndingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Omni Membership free trial ends in 3 days</Preview>
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
              Your Free Trial Ends in 3 Days
            </Heading>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              Your Omni Membership free trial will end on <strong>{trialEndDate}</strong>.
            </Text>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              After your trial ends, your subscription will start automatically. You&apos;ll continue to enjoy:
            </Text>
            <Text style={{ color: '#3f3f46', lineHeight: '1.8' }}>
              • 50% off all e-books<br />
              • Sweepstake entries on every purchase<br />
              • Full library access<br />
              • Monthly newsletter
            </Text>
            <Text style={{ color: '#71717a', fontSize: '14px' }}>
              If you&apos;d like to cancel or update your payment method before your trial ends, visit the member portal below.
            </Text>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Button
              href={portalUrl}
              style={{
                backgroundColor: '#18181b',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Manage Subscription
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default TrialEndingEmail
