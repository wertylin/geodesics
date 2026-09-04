"use client"

import { useEffect } from "react"
import {
    clearVisitorAgentSession,
    hydrateVisitorSession,
    readVisitorAgentSession,
    VISITOR_AGENT_SESSION_KEY,
    visitorSessionFromLoginPayload,
} from "@/lib/agent-session"

/** Cookie is source of truth. Never trust localStorage / stale sessionStorage alone. */
export function AuthSessionHydrate() {
    useEffect(() => {
        try {
            localStorage.removeItem(VISITOR_AGENT_SESSION_KEY)
        } catch {
            /* ignore */
        }

        const ac = new AbortController()
        void fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store",
            signal: ac.signal,
        })
            .then((r) => r.json())
            .then((d: { session?: Record<string, unknown> | null }) => {
                if (ac.signal.aborted) return
                if (!d.session) {
                    if (readVisitorAgentSession()) clearVisitorAgentSession()
                    return
                }
                const session = visitorSessionFromLoginPayload(d.session)
                if (!session) {
                    clearVisitorAgentSession()
                    return
                }
                hydrateVisitorSession(session)
            })
            .catch(() => {
                if (!ac.signal.aborted && readVisitorAgentSession()) {
                    // Network blip: keep tab mirror; cookie still gates APIs.
                }
            })
        return () => ac.abort()
    }, [])
    return null
}
