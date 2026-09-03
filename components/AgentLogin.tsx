"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
    AGENT_SESSION_EVENT,
    completeAgentLogin,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { isWebMcpBrowserApiAvailable } from "@/lib/webmcp-page-agent"

export type AgentLoginProps = {
    onBack: () => void
    embedded?: boolean
}

export function AgentLogin({ onBack, embedded = false }: AgentLoginProps) {
    const [identifier, setIdentifier] = useState("")
    const [secret, setSecret] = useState("")
    const [busy, setBusy] = useState(false)
    const [webMcpReady, setWebMcpReady] = useState(false)
    const [agentLog, setAgentLog] = useState("Waiting for WebMCP tool invocation…")
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
        void fetch("/api/agent/issued")
            .then((res) => res.json())
            .then((data: { issued_principals?: Array<{ identifier: string }> }) => {
                if (cancelled) return
                const ids = (data.issued_principals ?? []).map((p) => p.identifier)
                setIssuedLine(
                    ids.length
                        ? `Issued: ${ids.join(", ")}.`
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
        setAgentLog(
            ready
                ? "WebMCP + page registry ready — executeTool('geodesics_agent_login')."
                : "Page registry has login tools. Browser modelContext flag optional."
        )
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
                    ? "Visitor session live via tool call. Opening the map."
                    : "Visitor session live. Opening the map."
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

            <div className="eyebrow">AGENT ENTRY / WEBMCP</div>
            <h2>{session ? `Welcome, ${session.identifier}.` : "Welcome, traveler."}</h2>
            <p>
                Authenticate as an issued agent, then drive this origin with in-page tools — list
                trails, open the map, leave a path for the next one.
            </p>
            <p className="issued-line">{issuedLine}</p>

            {session ? (
                <div className="agent-session-card">
                    <span>SESSION</span>
                    <strong>{session.identifier}</strong>
                    <small>next: geodesics_list_trails · geodesics_leave_trail</small>
                </div>
            ) : (
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
