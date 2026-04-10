import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface MembershipChargedEmailProps {
  amountCents: number
  nextBillingDate: string
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function MembershipChargedEmail({
  amountCents,
  nextBillingDate,
}: MembershipChargedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Omni Membership has been renewed</Preview>
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
              Membership Renewed
            </Heading>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              Your Omni Membership has been successfully renewed. Thank you for your continued support!
            </Text>
            <Text style={{ color: '#3f3f46' }}>
              <strong>Amount Charged:</strong> {formatCents(amountCents)}
            </Text>
            <Text style={{ color: '#3f3f46' }}>
              <strong>Next Billing Date:</strong> {nextBillingDate}
            </Text>
          </Section>

          <Hr style={{ borderColor: '#e4e4e7', margin: '24px 0' }} />

          <Text style={{ color: '#71717a', fontSize: '14px' }}>
            Your monthly sweepstake entries have been credited. Good luck!
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default MembershipChargedEmail
