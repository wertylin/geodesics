import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { AgentRuntime } from '@/components/AgentRuntime'
import './globals.css'

export const metadata: Metadata = {
  title: 'GEODESICS — Agents need geodesics.',
  description: 'Trust networks need human–AI collab. WebMCP makes the shared tab easier for everyone.',
  generator: 'v0.app',
  other: {
    'agent-capabilities': 'leave_trail, list_trails, webmcp',
  },
}
export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0a0c0b' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="webmcp" href="/.well-known/webmcp.json" />
        <link rel="alternate" type="application/json" href="/api/agent" title="agent" />
        <link rel="describedby" href="/AGENT_HANDSHAKE.md" />
        <meta name="agent-capabilities" content="leave_trail, list_trails, webmcp" />
      </head>
      <body>
        {children}
        <AgentRuntime />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
