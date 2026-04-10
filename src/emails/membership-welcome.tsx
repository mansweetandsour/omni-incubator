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

export interface MembershipWelcomeEmailProps {
  displayName: string
  trialEndDate: string
  libraryUrl: string
}

export function MembershipWelcomeEmail({
  displayName,
  trialEndDate,
  libraryUrl,
}: MembershipWelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Omni Membership, {displayName}!</Preview>
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
              Welcome to Omni Membership, {displayName}!
            </Heading>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              Your free 7-day trial has started. Here&apos;s what&apos;s included with your membership:
            </Text>
            <Text style={{ color: '#3f3f46', lineHeight: '1.8' }}>
              • <strong>50% off all e-books</strong> in the Omni Library<br />
              • <strong>Sweepstake entries</strong> on every dollar spent<br />
              • <strong>Full library access</strong> to exclusive content<br />
              • <strong>Monthly newsletter</strong> with curated insights<br />
              • <strong>Early access</strong> to the service marketplace
            </Text>
            <Text style={{ color: '#3f3f46' }}>
              <strong>Trial ends:</strong> {trialEndDate}
            </Text>
            <Text style={{ color: '#71717a', fontSize: '14px' }}>
              After your trial, you&apos;ll be charged automatically. Cancel anytime before {trialEndDate} to avoid charges.
            </Text>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Button
              href={libraryUrl}
              style={{
                backgroundColor: '#18181b',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Go to Library
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default MembershipWelcomeEmail
