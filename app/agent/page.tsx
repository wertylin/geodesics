"use client"

import { AgentLogin } from "@/components/AgentLogin"
import { Footer, Header } from "@/components/geodesics"

export default function AgentPage() {
    return (
        <>
            <Header />
            <main className="agent-page">
                <AgentLogin embedded onBack={() => history.back()} />
            </main>
            <Footer />
        </>
    )
}
