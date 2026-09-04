"use client"

import { useEffect, useState } from "react"
import { AgentActivityTicker } from "@/components/AgentActivityTicker"
import { AgentObserverPanel } from "@/components/AgentObserverPanel"
import { AuthTerminal } from "@/components/AuthTerminal"
import { TrustNetworkPanel } from "@/components/LiveNetwork"
import {
    AGENT_OPEN_LOGIN_EVENT,
    AGENT_SESSION_EVENT,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"

const OPEN_KEY = "geodesics_live_dock_open"

/**
 * Guest → opaque auth terminal only (no activity / trust leak).
 * Authed → observer · activity · trust.
 */
export function AgentLiveChrome() {
    const [ready, setReady] = useState(false)
    const [open, setOpen] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)

    useEffect(() => {
        const live = readVisitorAgentSession()
        setSession(live)
        try {
            setOpen(sessionStorage.getItem(OPEN_KEY) === "1")
        } catch {
            setOpen(false)
        }
        setReady(true)

        const onSession = (e: Event) => {
            const next = (e as CustomEvent<VisitorAgentSession | null>).detail ?? null
            setSession(next)
            // Don't auto-expand dock on hydrate/login — user opens it explicitly.
        }
        const onOpenLogin = () => setOpen(true)
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        window.addEventListener(AGENT_OPEN_LOGIN_EVENT, onOpenLogin)
        return () => {
            window.removeEventListener(AGENT_SESSION_EVENT, onSession)
            window.removeEventListener(AGENT_OPEN_LOGIN_EVENT, onOpenLogin)
        }
    }, [])

    useEffect(() => {
        if (!ready) return
        try {
            sessionStorage.setItem(OPEN_KEY, open ? "1" : "0")
        } catch {
            /* ignore */
        }
        document.body.dataset.liveDock = open ? "open" : "closed"
        document.body.dataset.auth = session ? "1" : "0"
        return () => {
            delete document.body.dataset.liveDock
            delete document.body.dataset.auth
        }
    }, [open, ready, session])

    if (!ready) return null

    const authed = Boolean(session)

    return (
        <div
            className="agent-live-chrome"
            data-open={open ? "true" : "false"}
            data-auth={authed ? "true" : "false"}
        >
            <button
                type="button"
                className="agent-live-toggle"
                aria-expanded={open}
                aria-controls="agent-live-dock"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="activity-pulse" aria-hidden />
                {open
                    ? authed
                        ? "Hide live"
                        : "Hide auth"
                    : authed
                      ? "Live · session"
                      : "Auth · enter"}
                <span aria-hidden>{open ? "↓" : "↑"}</span>
            </button>

            {open ? (
                <div
                    id="agent-live-dock"
                    className={authed ? "agent-live-dock" : "agent-live-dock auth-only"}
                >
                    {authed ? (
                        <>
                            <AgentObserverPanel compact />
                            <AgentActivityTicker />
                            <TrustNetworkPanel />
                        </>
                    ) : (
                        <AuthTerminal />
                    )}
                </div>
            ) : null}
        </div>
    )
}
