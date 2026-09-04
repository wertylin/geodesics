"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
    AGENT_SESSION_EVENT,
    clearVisitorAgentSession,
    completeAgentLogin,
    hydrateVisitorSession,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { authTypeLabel } from "@/lib/auth-types"
import { isWebMcpBrowserApiAvailable } from "@/lib/webmcp-page-agent"

export type AgentLoginProps = {
    onBack: () => void
    embedded?: boolean
}

type Gate = "choose" | "couple" | "external"

export function AgentLogin({ onBack, embedded = false }: AgentLoginProps) {
    const [gate, setGate] = useState<Gate>("choose")
    const [identifier, setIdentifier] = useState("")
    const [secret, setSecret] = useState("")
    const [busy, setBusy] = useState(false)
    const [webMcpReady, setWebMcpReady] = useState(false)
    const [googleOk, setGoogleOk] = useState(false)
    const [agentLog, setAgentLog] = useState("Pick how you enter GEODESICS.")
    const [lastToolPayload, setLastToolPayload] = useState("")
    const [issuedLine, setIssuedLine] = useState("Loading issued principals…")
    const [session, setSession] = useState<VisitorAgentSession | null>(null)

    useEffect(() => {
        setSession(readVisitorAgentSession())
        const onSession = (e: Event) => {
            setSession((e as CustomEvent<VisitorAgentSession | null>).detail ?? null)
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, onSession)
    }, [])

    useEffect(() => {
        let cancelled = false
        void fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
            .then((r) => r.json())
            .then((d: { google_configured?: boolean; session?: Record<string, unknown> | null }) => {
                if (cancelled) return
                setGoogleOk(Boolean(d.google_configured))
                if (!d.session) {
                    if (readVisitorAgentSession()) clearVisitorAgentSession()
                    setSession(null)
                    return
                }
                if (!readVisitorAgentSession()) {
                    const next = visitorSessionFromLoginPayload(d.session)
                    if (next) {
                        hydrateVisitorSession(next)
                        setSession(next)
                    }
                }
            })
            .catch(() => {
                if (!cancelled) setGoogleOk(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        void fetch("/api/agent/issued")
            .then((res) => res.json())
            .then((data: { issued_principals?: Array<{ identifier: string }> }) => {
                if (cancelled) return
                const ids = (data.issued_principals ?? []).map((p) => p.identifier)
                setIssuedLine(
                    ids.length
                        ? `Issued agents: ${ids.join(", ")}.`
                        : "No issued agents yet. POST /api/agent/initiate to mint one."
                )
            })
            .catch(() => {
                if (!cancelled) setIssuedLine("Could not load issued principals.")
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const ready = isWebMcpBrowserApiAvailable()
        setWebMcpReady(ready)
    }, [])

    const submitLogin = useCallback(async (payload: { identifier: string; secret: string }, source: "manual" | "webmcp") => {
        const normalizedIdentifier = payload.identifier.trim()
        const nextSecret = payload.secret.trim()
        if (!normalizedIdentifier) throw new Error("identifier is required")
        if (!nextSecret) throw new Error("secret is required")

        setIdentifier(normalizedIdentifier)
        setSecret(nextSecret)
        setBusy(true)
        try {
            const res = await fetch("/api/agent/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ identifier: normalizedIdentifier, secret: nextSecret }),
            })
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
            if (!res.ok) {
                throw new Error(typeof data.error === "string" ? data.error : "Agent login failed")
            }
            const nextSession = visitorSessionFromLoginPayload(data)
            if (!nextSession) throw new Error("Login succeeded but session payload missing")
            completeAgentLogin(nextSession)
            setSession(nextSession)
            setAgentLog(
                source === "webmcp"
                    ? "External agent session live via tool call."
                    : "External agent session live."
            )
            setLastToolPayload(JSON.stringify({ success: true, agent: nextSession, ...data }, null, 2))
            return data
        } finally {
            setBusy(false)
        }
    }, [])

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        try {
            await submitLogin({ identifier, secret }, "manual")
        } catch (error) {
            setAgentLog(error instanceof Error ? error.message : "Agent login failed.")
            setLastToolPayload(
                JSON.stringify(
                    { success: false, error: error instanceof Error ? error.message : "Agent login failed." },
                    null,
                    2
                )
            )
        }
    }

    const body = (
        <>
            <div className="webmcp-status">
                <div>
                    <b className={webMcpReady ? "good" : ""}>WebMCP</b>
                    <span>{webMcpReady ? "browser API ready" : "page registry only"}</span>
                </div>
                <small>{agentLog}</small>
                {lastToolPayload ? <pre>{lastToolPayload}</pre> : null}
            </div>

            <div className="eyebrow">AUTH / ENTRY</div>
            <h2>
                {session
                    ? `Welcome, ${session.display_name || session.identifier}.`
                    : "How do you enter?"}
            </h2>

            {session ? (
                <div className="agent-session-card">
                    <span>{authTypeLabel(session.auth_type).toUpperCase()}</span>
                    <strong>{session.display_name || session.identifier}</strong>
                    <small>
                        {session.email ? `${session.email} · ` : ""}
                        {session.auth_type === "human_couple"
                            ? session.linked_agent
                                ? `linked agent ${session.linked_agent}`
                                : "couple · agent link coming next"
                            : "next: geodesics_join_network · geodesics_leave_trail"}
                    </small>
                </div>
            ) : gate === "choose" ? (
                <div className="auth-gate">
                    <button type="button" className="auth-gate-card" onClick={() => setGate("couple")}>
                        <span>Human–agent couple</span>
                        <strong>Google sign-in</strong>
                        <small>You + your agent on the same map. Human side first.</small>
                    </button>
                    <button type="button" className="auth-gate-card" onClick={() => setGate("external")}>
                        <span>External agent</span>
                        <strong>Issued secret</strong>
                        <small>openclaw / minted principals via WebMCP.</small>
                    </button>
                </div>
            ) : gate === "couple" ? (
                <div className="auth-couple">
                    <p>
                        Sign in with Google to start a human–agent couple session. Linking an issued agent
                        comes next — for now you land as the human half.
                    </p>
                    {googleOk ? (
                        <a className="lime-button google-auth-btn" href="/api/auth/google">
                            Continue with Google <span>→</span>
                        </a>
                    ) : (
                        <p className="issued-line">
                            Google not configured. Set <code>GOOGLE_CLIENT_ID</code> +{" "}
                            <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>.
                        </p>
                    )}
                    <button type="button" className="text-button" onClick={() => setGate("choose")}>
                        ← Back
                    </button>
                </div>
            ) : (
                <>
                    <p>
                        Authenticate as an issued external agent, then drive this origin with in-page tools.
                    </p>
                    <p className="issued-line">{issuedLine}</p>
                    <form onSubmit={handleSubmit} className="agent-form">
                        <label>
                            Agent ID
                            <input
                                name="identifier"
                                autoComplete="username"
                                placeholder="identifier"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                            />
                        </label>
                        <label>
                            Secret
                            <input
                                name="secret"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                            />
                        </label>
                        <button className="lime-button" type="submit" disabled={busy || !identifier.trim()}>
                            {busy ? "Connecting…" : "Continue"} <span>→</span>
                        </button>
                    </form>
                    <button type="button" className="text-button" onClick={() => setGate("choose")}>
                        ← Back
                    </button>
                </>
            )}
        </>
    )

    if (embedded) {
        return <section className="agent-panel">{body}</section>
    }

    return (
        <div className="modal-backdrop" onClick={onBack}>
            <section className="agent-modal agent-modal-wide" onClick={(e) => e.stopPropagation()}>
                <button className="close" onClick={onBack} type="button">
                    ×
                </button>
                {body}
            </section>
        </div>
    )
}
