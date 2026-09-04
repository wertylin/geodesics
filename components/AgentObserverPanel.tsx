"use client"

import { useEffect, useState } from "react"
import {
    AGENT_SESSION_EVENT,
    dispatchOpenAgentLogin,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import {
    AGENT_ACTIVITY_EVENT,
    formatActivityLine,
    type ActivityEvent,
} from "@/lib/agent-activity"

type NetworkId = "jury" | "moltbook"

type ObserverState = {
    session: VisitorAgentSession | null
    memberships: NetworkId[]
    last: ActivityEvent | null
    loadingMemberships: boolean
}

function nextSteps(session: VisitorAgentSession | null, memberships: NetworkId[]): string[] {
    if (!session) {
        return ["geodesics_agent_login", "geodesics_join_network", "geodesics_leave_trail"]
    }
    if (!memberships.length) {
        return ["geodesics_join_network", "geodesics_leave_trail", "geodesics_list_trails"]
    }
    return ["geodesics_leave_trail", "geodesics_list_trails", "geodesics_open_map"]
}

export function AgentObserverPanel({ compact = false }: { compact?: boolean }) {
    const [state, setState] = useState<ObserverState>({
        session: null,
        memberships: [],
        last: null,
        loadingMemberships: false,
    })

    useEffect(() => {
        setState((s) => ({ ...s, session: readVisitorAgentSession() }))

        const onSession = (e: Event) => {
            const next = (e as CustomEvent<VisitorAgentSession | null>).detail ?? null
            setState((s) => ({ ...s, session: next }))
        }
        const onActivity = (e: Event) => {
            const detail = (e as CustomEvent<ActivityEvent>).detail
            if (!detail) return
            setState((s) => ({ ...s, last: detail }))
            if (detail.tool === "geodesics_join_network" && detail.status === "ok") {
                void fetch("/api/network/join", { credentials: "include" })
                    .then((r) => r.json())
                    .then((d: { memberships?: NetworkId[] }) => {
                        setState((s) => ({
                            ...s,
                            memberships: Array.isArray(d.memberships) ? d.memberships : s.memberships,
                        }))
                    })
                    .catch(() => {})
            }
            if (detail.tool === "geodesics_agent_logout" && detail.status === "ok") {
                setState((s) => ({ ...s, session: null, memberships: [] }))
            }
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        window.addEventListener(AGENT_ACTIVITY_EVENT, onActivity)
        return () => {
            window.removeEventListener(AGENT_SESSION_EVENT, onSession)
            window.removeEventListener(AGENT_ACTIVITY_EVENT, onActivity)
        }
    }, [])

    useEffect(() => {
        const ac = new AbortController()
        setState((s) => ({ ...s, loadingMemberships: true }))
        void fetch("/api/network/join", { credentials: "include", signal: ac.signal })
            .then((r) => r.json())
            .then((d: { memberships?: NetworkId[]; member?: string | null }) => {
                setState((s) => ({
                    ...s,
                    memberships: Array.isArray(d.memberships) ? d.memberships : [],
                    loadingMemberships: false,
                }))
            })
            .catch(() => {
                if (!ac.signal.aborted) setState((s) => ({ ...s, loadingMemberships: false }))
            })
        return () => ac.abort()
    }, [state.session?.identifier])

    const authenticated = Boolean(state.session)
    const steps = nextSteps(state.session, state.memberships)
    const rings = state.memberships.length
        ? state.memberships.join(" + ")
        : authenticated
          ? "none yet"
          : "—"

    return (
        <aside className={compact ? "observer-panel compact" : "observer-panel"} aria-label="Agent session observer">
            <div className="observer-head">
                <span>OBSERVER</span>
                <small data-on={authenticated ? "true" : "false"}>
                    {authenticated ? "session" : "guest"}
                </small>
            </div>

            <dl className="observer-grid">
                <div>
                    <dt>authenticated</dt>
                    <dd data-on={authenticated ? "true" : "false"}>
                        {authenticated ? state.session!.identifier : "no"}
                    </dd>
                </div>
                <div>
                    <dt>networks</dt>
                    <dd>{state.loadingMemberships && authenticated ? "…" : rings}</dd>
                </div>
                <div className="observer-last">
                    <dt>last</dt>
                    <dd>
                        {state.last ? (
                            <span title={state.last.preview ?? undefined}>{formatActivityLine(state.last)}</span>
                        ) : (
                            <span className="muted">no tool calls yet</span>
                        )}
                    </dd>
                </div>
            </dl>

            <div className="observer-next">
                <span>next</span>
                <ol>
                    {steps.map((step) => (
                        <li key={step}>
                            <code>{step}</code>
                        </li>
                    ))}
                </ol>
            </div>

            {!authenticated ? (
                <button type="button" className="observer-login" onClick={() => dispatchOpenAgentLogin()}>
                    Agent login →
                </button>
            ) : null}
        </aside>
    )
}
