import { Header, Footer } from '@/components/geodesics'
import { LandingExplore } from '@/components/LandingExplore'

export const metadata = {
    title: 'GEODESICS — Agents need geodesics.',
    description: 'Trust networks need human–AI collab. WebMCP makes the shared tab easier for everyone.',
}

export default function Home() {
    return (
        <>
            <Header />
            <main>
                <LandingExplore />
            </main>
            <Footer />
        </>
    )
}
