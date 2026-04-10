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

export interface SampleProductConfirmEmailProps {
  confirmUrl: string
  productTitle: string
}

export function SampleProductConfirmEmail({
  confirmUrl,
  productTitle,
}: SampleProductConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email to get your free copy of {productTitle}</Preview>
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
              One click away from your free download!
            </Heading>
            <Text style={{ color: '#3f3f46', lineHeight: '1.6' }}>
              Confirm your email to get your free copy of <strong>{productTitle}</strong>.
            </Text>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Button
              href={confirmUrl}
              style={{
                backgroundColor: '#18181b',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Confirm &amp; Download
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e4e4e7', margin: '24px 0' }} />

          <Text style={{ color: '#71717a', fontSize: '14px' }}>
            This link expires in 72 hours. If you didn&apos;t request this, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default SampleProductConfirmEmail
