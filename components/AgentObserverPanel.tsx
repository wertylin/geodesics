"use client"

import { useEffect, useState } from "react"
import {
    AGENT_SESSION_EVENT,
    hydrateVisitorSession,
    logoutVisitor,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import {
    AGENT_ACTIVITY_EVENT,
    formatActivityLine,
    type ActivityEvent,
} from "@/lib/agent-activity"

type NetworkId = string

type ObserverState = {
    session: VisitorAgentSession | null
    memberships: NetworkId[]
    last: ActivityEvent | null
    loadingMemberships: boolean
}

function nextSteps(session: VisitorAgentSession | null, memberships: NetworkId[]): string[] {
    if (!session) {
        return ["auth terminal", "geodesics_join_network", "geodesics_leave_trail"]
    }
    if (session.auth_type === "human_couple" && !session.linked_agent) {
        return ["await agent Yes/No / mint invite", "start human trust network", "geodesics_leave_trail"]
    }
    if (session.auth_type === "external_agent" && !session.coupled_human) {
        return ["geodesics_couple_request (email)", "geodesics_couple_status", "geodesics_join_network"]
    }
    if (!memberships.length) {
        return ["geodesics_join_network", "geodesics_leave_trail", "geodesics_list_trails"]
    }
    return ["geodesics_leave_trail", "geodesics_list_trails", "geodesics_open_map"]
}

type PendingReq = { agent: string; human_email: string | null; exp: string }

function CoupleLinkBox({
    session,
    onSession,
}: {
    session: VisitorAgentSession
    onSession: (s: VisitorAgentSession) => void
}) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [invite, setInvite] = useState<string | null>(null)
    const [expiresIn, setExpiresIn] = useState<number | null>(null)
    const [pending, setPending] = useState<PendingReq[]>([])

    const loadPending = async () => {
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "pending" }),
            })
            const data = (await res.json().catch(() => ({}))) as { pending?: PendingReq[] }
            if (res.ok && Array.isArray(data.pending)) setPending(data.pending)
        } catch {
            /* ignore */
        }
    }

    useEffect(() => {
        if (session.linked_agent) {
            setPending([])
            return
        }
        void loadPending()
        const id = window.setInterval(() => void loadPending(), 2500)
        return () => window.clearInterval(id)
    }, [session.identifier, session.linked_agent])

    const mint = async () => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "invite" }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                invite?: string
                expires_in_sec?: number
            }
            if (!res.ok) throw new Error(data.error || "invite failed")
            setInvite(data.invite ?? null)
            setExpiresIn(typeof data.expires_in_sec === "number" ? data.expires_in_sec : null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "invite failed")
        } finally {
            setBusy(false)
        }
    }

    const accept = async (agent: string) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "accept", agent }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                session?: Record<string, unknown>
            }
            if (!res.ok) throw new Error(data.error || "accept failed")
            const next = data.session ? visitorSessionFromLoginPayload(data.session) : null
            if (next) {
                hydrateVisitorSession(next)
                onSession(next)
            }
            setPending([])
            setInvite(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "accept failed")
        } finally {
            setBusy(false)
        }
    }

    const reject = async (agent: string) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "reject", agent }),
            })
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(data.error || "reject failed")
            }
            await loadPending()
        } catch (err) {
            setError(err instanceof Error ? err.message : "reject failed")
        } finally {
            setBusy(false)
        }
    }

    const unlink = async () => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "unlink" }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                session?: Record<string, unknown>
            }
            if (!res.ok) throw new Error(data.error || "unlink failed")
            const next = data.session ? visitorSessionFromLoginPayload(data.session) : null
            if (next) {
                hydrateVisitorSession(next)
                onSession(next)
            }
            setInvite(null)
            setExpiresIn(null)
            await loadPending()
        } catch (err) {
            setError(err instanceof Error ? err.message : "unlink failed")
        } finally {
            setBusy(false)
        }
    }

    if (session.linked_agent) {
        return (
            <div className="couple-link">
                <span className="couple-link-label">linked agent</span>
                <strong>{session.linked_agent}</strong>
                <small className="muted">bond live · agent may login via mode:&quot;linked&quot; (no secret)</small>
                <button type="button" className="observer-login" disabled={busy} onClick={() => void unlink()}>
                    unlink →
                </button>
                {error ? <small className="couple-err">{error}</small> : null}
            </div>
        )
    }

    return (
        <div className="couple-link">
            <span className="couple-link-label">couple</span>
            {pending.length ? (
                <div className="couple-pending">
                    <small className="muted">incoming · yes/no also on overlay</small>
                    <ul>
                        {pending.map((p) => (
                            <li key={p.agent}>
                                <strong>{p.agent}</strong>
                                <span className="couple-pending-actions">
                                    <button type="button" disabled={busy} onClick={() => void accept(p.agent)}>
                                        yes
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => void reject(p.agent)}>
                                        no
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="couple-hint">
                    Waiting for an agent request to your email — you&apos;ll get a Yes/No prompt. Or mint an invite.
                </p>
            )}
            <div className="couple-actions">
                <button type="button" className="observer-login" disabled={busy} onClick={() => void mint()}>
                    {busy ? "…" : invite ? "re-mint invite →" : "mint invite →"}
                </button>
            </div>
            {invite ? (
                <pre className="couple-key-out">{`invite (${expiresIn ?? "?"}s)
${invite}

agent (no secret):
executeTool("geodesics_agent_login", {
  identifier: "openclaw",
  invite: "…"
})`}</pre>
            ) : null}
            {error ? <small className="couple-err">{error}</small> : null}
        </div>
    )
}

function AgentCoupleRequestBox({ session }: { session: VisitorAgentSession }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [email, setEmail] = useState("")
    const [awaiting, setAwaiting] = useState(false)
    const [target, setTarget] = useState<string | null>(null)
    const [expiresIn, setExpiresIn] = useState<number | null>(null)

    useEffect(() => {
        if (!awaiting || session.coupled_human) return
        let cancelled = false
        const tick = async () => {
            try {
                const res = await fetch("/api/auth/couple", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ action: "request_status" }),
                })
                const data = (await res.json().catch(() => ({}))) as {
                    linked?: boolean
                    awaiting?: boolean
                    session?: Record<string, unknown>
                }
                if (cancelled || !res.ok) return
                if (data.linked && data.session) {
                    const next = visitorSessionFromLoginPayload(data.session)
                    if (next) hydrateVisitorSession(next)
                    setAwaiting(false)
                } else if (data.awaiting === false) {
                    setAwaiting(false)
                }
            } catch {
                /* ignore */
            }
        }
        void tick()
        const id = window.setInterval(() => void tick(), 2500)
        return () => {
            cancelled = true
            window.clearInterval(id)
        }
    }, [awaiting, session.coupled_human])

    if (session.coupled_human) {
        return (
            <div className="couple-link">
                <span className="couple-link-label">coupled human</span>
                <strong>{session.coupled_human}</strong>
                <small className="muted">bond live</small>
            </div>
        )
    }

    const send = async () => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action: "request",
                    email: email.trim(),
                }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                human_email?: string
                expires_in_sec?: number
                awaiting?: boolean
            }
            if (!res.ok) throw new Error(data.error || "request failed")
            setAwaiting(true)
            setTarget(data.human_email ?? email.trim())
            setExpiresIn(typeof data.expires_in_sec === "number" ? data.expires_in_sec : null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "request failed")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="couple-link">
            <span className="couple-link-label">request couple</span>
            {awaiting ? (
                <>
                    <p className="couple-hint">
                        awaiting · <em>{target}</em>
                        {expiresIn ? ` · ${expiresIn}s window` : ""} — Yes/No on their tab
                    </p>
                    <button
                        type="button"
                        className="observer-login"
                        disabled={busy}
                        onClick={() => void send()}
                    >
                        re-notify →
                    </button>
                </>
            ) : (
                <>
                    <p className="couple-hint">
                        Send to their Google email — they get a Yes/No notification (no paste codes).
                    </p>
                    <label className="couple-req-paste">
                        <span>email</span>
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="human@…"
                            spellCheck={false}
                            autoComplete="email"
                        />
                    </label>
                    <button
                        type="button"
                        className="observer-login"
                        disabled={busy || !email.trim().includes("@")}
                        onClick={() => void send()}
                    >
                        {busy ? "…" : "send couple request →"}
                    </button>
                </>
            )}
            {error ? <small className="couple-err">{error}</small> : null}
        </div>
    )
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
            const next = (e as CustomEvent<VisitorAgentSession | null>).detail ?? readVisitorAgentSession()
            setState((s) => ({ ...s, session: next }))
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
            .then((d: { memberships?: NetworkId[] }) => {
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
    const authLabel = state.session
        ? state.session.auth_type === "human_couple"
            ? "couple"
            : "agent"
        : "guest"
    const isCouple = state.session?.auth_type === "human_couple"

    return (
        <aside className={compact ? "observer-panel compact" : "observer-panel"} aria-label="Agent session observer">
            <div className="observer-head">
                <span>OBSERVER</span>
                <small data-on={authenticated ? "true" : "false"}>{authLabel}</small>
            </div>

            <dl className="observer-grid">
                <div>
                    <dt>authenticated</dt>
                    <dd data-on={authenticated ? "true" : "false"}>
                        {authenticated
                            ? state.session!.display_name || state.session!.identifier
                            : "no"}
                    </dd>
                </div>
                <div>
                    <dt>auth type</dt>
                    <dd>{authenticated ? state.session!.auth_type : "—"}</dd>
                </div>
                {state.session?.coupled_human ? (
                    <div>
                        <dt>coupled</dt>
                        <dd data-on="true">{state.session.coupled_human}</dd>
                    </div>
                ) : null}
                {isCouple ? (
                    <div>
                        <dt>agent</dt>
                        <dd data-on={state.session!.linked_agent ? "true" : "false"}>
                            {state.session!.linked_agent || "unlinked"}
                        </dd>
                    </div>
                ) : null}
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

            {isCouple && state.session ? (
                <CoupleLinkBox
                    session={state.session}
                    onSession={(s) => setState((prev) => ({ ...prev, session: s }))}
                />
            ) : null}

            {state.session?.auth_type === "external_agent" ? (
                <AgentCoupleRequestBox session={state.session} />
            ) : null}

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

            {authenticated ? (
                <button
                    type="button"
                    className="observer-login"
                    onClick={() => {
                        void logoutVisitor().then(() =>
                            setState((s) => ({ ...s, session: null, memberships: [] }))
                        )
                    }}
                >
                    sign out →
                </button>
            ) : null}
        </aside>
    )
}
