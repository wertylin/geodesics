"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
    completeAgentLogin,
    visitorSessionFromLoginPayload,
} from "@/lib/agent-session"

/** Hydrate client session after Google OAuth sets the HttpOnly cookie. */
export default function AuthCallbackPage() {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        void (async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "include" })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (cancelled) return
                if (!res.ok || !data.session) {
                    setError("Session missing after Google sign-in.")
                    return
                }
                const session = visitorSessionFromLoginPayload(data.session as Record<string, unknown>)
                if (!session) {
                    setError("Invalid session payload.")
                    return
                }
                completeAgentLogin(session)
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Auth callback failed")
            }
        })()
        return () => {
            cancelled = true
        }
    }, [router])

    return (
        <main className="agent-page">
            <div className="eyebrow">AUTH / CALLBACK</div>
            <h1>{error ? "Sign-in hiccup" : "Signing you in…"}</h1>
            <p className="muted">{error ?? "Hydrating human–agent couple session."}</p>
            {error ? (
                <p className="agent-door">
                    <a href="/">← Surface</a>
                </p>
            ) : null}
        </main>
    )
}
