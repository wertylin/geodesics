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
        let alive = true

        void (async () => {
            for (let attempt = 0; attempt < 6; attempt++) {
                try {
                    const res = await fetch("/api/auth/me", {
                        credentials: "include",
                        cache: "no-store",
                        signal: AbortSignal.timeout(4000),
                    })
                    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                    if (!alive) return
                    if (res.ok && data.session) {
                        const session = visitorSessionFromLoginPayload(
                            data.session as Record<string, unknown>
                        )
                        if (session) {
                            completeAgentLogin(session)
                            router.replace("/")
                            return
                        }
                    }
                } catch {
                    /* retry */
                }
                await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
            }
            if (alive) setError("Session missing after Google sign-in. Retry Google login.")
        })()

        return () => {
            alive = false
        }
    }, [router])

    return (
        <main className="agent-page">
            <div className="eyebrow">AUTH / CALLBACK</div>
            <h1>{error ? "Sign-in hiccup" : "Signing you in…"}</h1>
            <p className="muted">{error ?? "Hydrating human–agent couple session."}</p>
            {error ? (
                <p className="agent-door">
                    <a href="/api/auth/google">Retry Google →</a>
                    {" · "}
                    <a href="/">← Surface</a>
                </p>
            ) : null}
        </main>
    )
}
