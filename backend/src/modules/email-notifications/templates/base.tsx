import { Html, Body, Container, Preview, Tailwind, Head, Section, Text, Hr } from '@react-email/components'
import * as React from 'react'

interface BaseProps {
  preview?: string
  /**
   * Customer-facing chrome: a "Wheel Builds" wordmark header + a footer
   * (support guidance + copyright line). Internal ops emails (e.g.
   * `vendor-sync-alert`) pass `false` — there's no customer relationship to
   * brand and no support-inbox promise to make to an on-call engineer.
   */
  branded?: boolean
  children: React.ReactNode
}

export const Base: React.FC<BaseProps> = ({ preview, branded = true, children }) => {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans px-2">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px] w-full overflow-hidden">
            {branded && (
              <Section className="text-center mb-[8px]">
                <Text className="text-black text-[22px] font-bold tracking-[0.1em] uppercase mx-auto my-0">
                  Wheel Builds
                </Text>
              </Section>
            )}
            <div className="max-w-full break-words">
              {children}
            </div>
            {branded && (
              <>
                <Hr style={{ margin: '26px 0 16px' }} />
                <Text style={{ fontSize: '12px', color: '#666666', margin: '0 0 6px', textAlign: 'center' }}>
                  Questions about your order? Reply to this email — a real person answers.
                </Text>
                <Text style={{ fontSize: '12px', color: '#666666', margin: 0, textAlign: 'center' }}>
                  © {new Date().getFullYear()} Wheel Builds. All rights reserved.
                </Text>
              </>
            )}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
