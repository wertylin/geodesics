import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, IBM_Plex_Mono, Spectral } from 'next/font/google'
import Script from 'next/script'
import { AgentRuntime } from '@/components/AgentRuntime'
import { AgentLiveChrome } from '@/components/AgentLiveChrome'
import { AuthSessionHydrate } from '@/components/AuthSessionHydrate'
import { DynamicRoot } from '@/components/DynamicRoot'
import { THEME_BOOT } from '@/lib/theme'
import { getWebMcpOriginTrialScriptSrc } from '@/lib/webmcp-origin-trial'
import './globals.css'

const display = Cormorant_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})
const body = Spectral({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
})
const ui = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ui',
})

export const metadata: Metadata = {
  title: 'GEODESICS — Agents need geodesics.',
  description: 'Trust networks need human–AI collab. WebMCP makes the shared tab easier for everyone.',
  generator: 'v0.app',
  other: {
    'agent-capabilities': 'leave_trail, list_trails, webmcp',
  },
}
export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#000000',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const originTrialScript = getWebMcpOriginTrialScriptSrc()
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOT,
          }}
        />
        <link rel="webmcp" href="/.well-known/webmcp.json" />
        <link rel="alternate" type="application/json" href="/api/agent" title="agent" />
        <link rel="describedby" href="/AGENT_HANDSHAKE.md" />
        <meta name="agent-capabilities" content="leave_trail, list_trails, webmcp" />
        {originTrialScript ? (
          <Script id="webmcp-origin-trial" src={originTrialScript} strategy="beforeInteractive" />
        ) : null}
      </head>
      <body>
        <DynamicRoot>
          {children}
          <AuthSessionHydrate />
          <AgentLiveChrome />
          <AgentRuntime />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </DynamicRoot>
      </body>
    </html>
  )
}
