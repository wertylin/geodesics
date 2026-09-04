"use client"

import { useEffect, useState } from "react"
import { AgentActivityTicker } from "@/components/AgentActivityTicker"
import { AgentObserverPanel } from "@/components/AgentObserverPanel"
import { AuthTerminal } from "@/components/AuthTerminal"
import { CoupleRequestConsent } from "@/components/CoupleRequestConsent"
import { TrustNetworkPanel } from "@/components/LiveNetwork"
import {
    AGENT_OPEN_LOGIN_EVENT,
    AGENT_SESSION_EVENT,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"

const OPEN_KEY = "geodesics_live_dock_open"
const MODE_KEY = "geodesics_live_dock_mode"

type DeskMode = "dock" | "dashboard"

/**
 * Guest → opaque auth terminal only (no activity / trust leak).
 * Authed → observer · activity · trust.
 * Desk modes: compact dock strip, or full dashboard sheet.
 */
export function AgentLiveChrome() {
    const [ready, setReady] = useState(false)
    const [open, setOpen] = useState(false)
    const [mode, setMode] = useState<DeskMode>("dock")
    const [session, setSession] = useState<VisitorAgentSession | null>(null)

    useEffect(() => {
        const live = readVisitorAgentSession()
        setSession(live)
        try {
            setOpen(sessionStorage.getItem(OPEN_KEY) === "1")
            const m = sessionStorage.getItem(MODE_KEY)
            if (m === "dashboard" || m === "dock") setMode(m)
        } catch {
            setOpen(false)
        }
        setReady(true)

        const onSession = (e: Event) => {
            const next = (e as CustomEvent<VisitorAgentSession | null>).detail ?? null
            setSession(next)
        }
        const onOpenLogin = () => {
            setOpen(true)
            // Authed “open live” prefers dashboard — room to work.
            if (readVisitorAgentSession()) setMode("dashboard")
        }
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
            sessionStorage.setItem(MODE_KEY, mode)
        } catch {
            /* ignore */
        }
        const effectiveMode = open && session && mode === "dashboard" ? "dashboard" : open ? "dock" : "closed"
        document.body.dataset.liveDock = open ? "open" : "closed"
        document.body.dataset.liveMode = effectiveMode
        document.body.dataset.auth = session ? "1" : "0"
        return () => {
            delete document.body.dataset.liveDock
            delete document.body.dataset.liveMode
            delete document.body.dataset.auth
        }
    }, [open, mode, ready, session])

    if (!ready) return null

    const authed = Boolean(session)
    const dash = authed && open && mode === "dashboard"

    return (
        <div
            className="agent-live-chrome"
            data-open={open ? "true" : "false"}
            data-auth={authed ? "true" : "false"}
            data-mode={dash ? "dashboard" : "dock"}
        >
            {authed ? <CoupleRequestConsent /> : null}

            <div className="agent-live-chrome-bar">
                {open && authed ? (
                    <button
                        type="button"
                        className="agent-live-mode"
                        aria-pressed={dash}
                        onClick={() => setMode((m) => (m === "dashboard" ? "dock" : "dashboard"))}
                    >
                        {dash ? "desk ↓" : "dashboard ↑"}
                    </button>
                ) : null}
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
                            ? dash
                                ? "Close dashboard"
                                : "Hide live"
                            : "Hide auth"
                        : authed
                          ? "Live · session"
                          : "Auth · enter"}
                    <span aria-hidden>{open ? "↓" : "↑"}</span>
                </button>
            </div>

            {open ? (
                <div
                    id="agent-live-dock"
                    className={
                        authed
                            ? dash
                                ? "agent-live-dock desk-dashboard"
                                : "agent-live-dock"
                            : "agent-live-dock auth-only"
                    }
                >
                    {authed ? (
                        <>
                            <AgentObserverPanel compact={!dash} />
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
