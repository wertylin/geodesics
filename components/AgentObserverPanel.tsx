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

type NetworkId = "jury" | "moltbook"

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
        return ["accept agent request / mint invite", "geodesics_leave_trail"]
    }
    if (session.auth_type === "external_agent" && !session.coupled_human) {
        return ["geodesics_couple_request", "geodesics_join_network", "geodesics_leave_trail"]
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
    const [reqCode, setReqCode] = useState("")

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
        if (!session.linked_agent) void loadPending()
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

    const refresh = async () => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
            const data = (await res.json().catch(() => ({}))) as {
                session?: Record<string, unknown> | null
                error?: string
            }
            const next = data.session ? visitorSessionFromLoginPayload(data.session) : null
            if (!next) throw new Error("no session")
            hydrateVisitorSession(next)
            onSession(next)
            if (next.linked_agent) {
                setInvite(null)
                setExpiresIn(null)
                setPending([])
            } else {
                await loadPending()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "refresh failed")
        } finally {
            setBusy(false)
        }
    }

    const accept = async (payload: { request?: string; agent?: string }) => {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "accept", ...payload }),
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
            setReqCode("")
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
                    <small className="muted">incoming agent requests</small>
                    <ul>
                        {pending.map((p) => (
                            <li key={p.agent}>
                                <strong>{p.agent}</strong>
                                <span className="couple-pending-actions">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void accept({ agent: p.agent })}
                                    >
                                        accept
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => void reject(p.agent)}>
                                        reject
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            <p className="couple-hint">
                Agent can request first (<code>req_…</code>), or you mint an invite for them.
            </p>
            <label className="couple-req-paste">
                <span>req_…</span>
                <input
                    value={reqCode}
                    onChange={(e) => setReqCode(e.target.value)}
                    placeholder="paste agent request"
                    spellCheck={false}
                    autoComplete="off"
                />
                <button
                    type="button"
                    className="observer-login"
                    disabled={busy || !reqCode.trim()}
                    onClick={() => void accept({ request: reqCode.trim() })}
                >
                    accept request →
                </button>
            </label>
            <div className="couple-actions">
                <button type="button" className="observer-login" disabled={busy} onClick={() => void mint()}>
                    {busy ? "…" : invite ? "re-mint invite →" : "mint invite →"}
                </button>
                <button type="button" className="observer-login" disabled={busy} onClick={() => void refresh()}>
                    refresh →
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
    const [request, setRequest] = useState<string | null>(null)
    const [expiresIn, setExpiresIn] = useState<number | null>(null)

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
                    email: email.trim() || undefined,
                }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                request?: string
                expires_in_sec?: number
            }
            if (!res.ok) throw new Error(data.error || "request failed")
            setRequest(data.request ?? null)
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
            <p className="couple-hint">
                Already logged in? Ask a human to link later — they&apos;ll see it in Observer or paste{" "}
                <code>req_…</code>.
            </p>
            <label className="couple-req-paste">
                <span>email</span>
                <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="optional · human@…"
                    spellCheck={false}
                    autoComplete="email"
                />
            </label>
            <button type="button" className="observer-login" disabled={busy} onClick={() => void send()}>
                {busy ? "…" : request ? "re-send request →" : "send couple request →"}
            </button>
            {request ? (
                <pre className="couple-key-out">{`request (${expiresIn ?? "?"}s)
${request}

human: Observer → accept
or paste req_…`}</pre>
            ) : null}
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
