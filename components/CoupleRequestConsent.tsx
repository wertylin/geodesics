"use client"

import { useEffect, useState } from "react"
import {
    AGENT_SESSION_EVENT,
    hydrateVisitorSession,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type VisitorAgentSession,
} from "@/lib/agent-session"

export type CouplePendingRequest = {
    agent: string
    human_email: string | null
    exp: string
    created_at?: string
}

const POLL_MS = 2500

/**
 * Human tab: poll pending couple requests → overlay Yes/No (organizma genus-2 style).
 * No paste codes — agent must target this human's email.
 */
export function CoupleRequestConsent() {
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [pending, setPending] = useState<CouplePendingRequest[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const sync = () => setSession(readVisitorAgentSession())
        sync()
        window.addEventListener(AGENT_SESSION_EVENT, sync)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, sync)
    }, [])

    const active =
        session?.auth_type === "human_couple" && !session.linked_agent ? session : null

    useEffect(() => {
        if (!active) {
            setPending([])
            return
        }
        let cancelled = false
        const tick = async () => {
            try {
                const res = await fetch("/api/auth/couple", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ action: "pending" }),
                })
                const data = (await res.json().catch(() => ({}))) as {
                    pending?: CouplePendingRequest[]
                }
                if (!cancelled && res.ok && Array.isArray(data.pending)) {
                    setPending(data.pending)
                }
            } catch {
                /* ignore */
            }
        }
        void tick()
        const id = window.setInterval(() => void tick(), POLL_MS)
        return () => {
            cancelled = true
            window.clearInterval(id)
        }
    }, [active?.identifier])

    const head = pending[0]
    if (!active || !head) return null

    const respond = async (accept: boolean) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(
                    accept
                        ? { action: "accept", agent: head.agent }
                        : { action: "reject", agent: head.agent }
                ),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                session?: Record<string, unknown>
            }
            if (!res.ok) throw new Error(data.error || (accept ? "accept failed" : "decline failed"))
            if (accept && data.session) {
                const next = visitorSessionFromLoginPayload(data.session)
                if (next) hydrateVisitorSession(next)
            } else {
                setPending((prev) => prev.filter((p) => p.agent !== head.agent))
                window.dispatchEvent(new Event(AGENT_SESSION_EVENT))
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "failed")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="couple-consent" role="dialog" aria-label="Couple request">
            <div className="couple-consent-card">
                <p className="couple-consent-eyebrow">couple · agent request</p>
                <p className="couple-consent-body">
                    <span className="couple-consent-agent">{head.agent}</span> wants to link with you
                </p>
                <div className="couple-consent-actions">
                    <button type="button" disabled={busy} onClick={() => void respond(true)}>
                        yes
                    </button>
                    <button
                        type="button"
                        className="decline"
                        disabled={busy}
                        onClick={() => void respond(false)}
                    >
                        no
                    </button>
                </div>
                {pending.length > 1 ? (
                    <small className="couple-consent-more">+{pending.length - 1} more waiting</small>
                ) : null}
                {error ? <small className="couple-err">{error}</small> : null}
            </div>
        </div>
    )
}
