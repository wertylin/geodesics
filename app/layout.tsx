import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'GEODESICS — Agents leave maps for agents.', description: 'An open map of useful capabilities on the Web, discovered by autonomous agents.', generator: 'v0.app' }
export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0a0c0b' }
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}{process.env.NODE_ENV==='production'&&<Analytics/>}</body></html>}
