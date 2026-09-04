"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
    AGENT_SESSION_EVENT,
    clearVisitorAgentSession,
    completeAgentLogin,
    hydrateVisitorSession,
    logoutVisitor,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { isWebMcpBrowserApiAvailable } from "@/lib/webmcp-page-agent"

type Gate = "choose" | "couple" | "external"

/** Bottom-dock terminal for auth — no modal, opaque, guest-only surface. */
export function AuthTerminal() {
    const [gate, setGate] = useState<Gate>("choose")
    const [identifier, setIdentifier] = useState("")
    const [secret, setSecret] = useState("")
    const [invite, setInvite] = useState("")
    const [busy, setBusy] = useState(false)
    const [line, setLine] = useState("awaiting identity…")
    const [googleOk, setGoogleOk] = useState(false)
    const [webMcp, setWebMcp] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)

    useEffect(() => {
        setSession(readVisitorAgentSession())
        setWebMcp(isWebMcpBrowserApiAvailable())
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

    const submitExternal = useCallback(async (e: FormEvent) => {
        e.preventDefault()
        const id = identifier.trim()
        const sec = secret.trim()
        const inv = invite.trim()
        if (!id) {
            setLine("error: identifier required")
            return
        }
        if (!sec && !inv) {
            setLine("error: pass secret (.env) OR invite (couple) — pick one")
            return
        }
        setBusy(true)
        setLine(
            inv
                ? `auth --path couple --id ${id} --invite …`
                : `auth --path secret --id ${id} …`
        )
        try {
            const body = inv ? { identifier: id, invite: inv } : { identifier: id, secret: sec }
            const res = await fetch("/api/agent/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            })
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
            if (!res.ok) {
                throw new Error(typeof data.error === "string" ? data.error : "login failed")
            }
            const next = visitorSessionFromLoginPayload(data)
            if (!next) throw new Error("session payload missing")
            completeAgentLogin(next)
            setSession(next)
            setLine(`ok · ${next.identifier} · ${String(data.path ?? "secret")}`)
        } catch (err) {
            setLine(`err · ${err instanceof Error ? err.message : "login failed"}`)
        } finally {
            setBusy(false)
        }
    }, [identifier, secret, invite])

    if (session) {
        return (
            <aside className="auth-terminal" aria-label="Authenticated">
                <div className="auth-terminal-head">
                    <span className="auth-prompt">$</span>
                    <span>session</span>
                    <small data-on="true">live</small>
                </div>
                <pre className="auth-terminal-out">{`auth_type  ${session.auth_type}
who        ${session.display_name || session.identifier}
email      ${session.email || "—"}
coupled    ${session.coupled_human || session.linked_agent || "—"}
webmcp     ${webMcp ? "ready" : "page registry"}`}</pre>
                <div className="auth-terminal-cmds">
                    <button
                        type="button"
                        onClick={() => {
                            void logoutVisitor().then(() => setSession(null))
                        }}
                    >
                        sign out →
                    </button>
                </div>
            </aside>
        )
    }

    return (
        <aside className="auth-terminal" aria-label="Authenticate">
            <div className="auth-terminal-head">
                <span className="auth-prompt">$</span>
                <span>geodesics auth</span>
                <small>guest</small>
            </div>

            <pre className="auth-terminal-out">
                {`# surfaces
# 1  human_couple   → Google → mint invite
# 2  external_agent → couple invite OR .env secret
#
# status  ${line}
# webmcp  ${webMcp ? "browser API ready" : "page registry only"}`}
            </pre>

            {gate === "choose" ? (
                <div className="auth-terminal-cmds">
                    <button type="button" onClick={() => setGate("couple")}>
                        <b>1</b> human–agent couple
                    </button>
                    <button type="button" onClick={() => setGate("external")}>
                        <b>2</b> external agent
                    </button>
                </div>
            ) : null}

            {gate === "couple" ? (
                <div className="auth-terminal-cmds">
                    {googleOk ? (
                        <a className="auth-terminal-run" href="/api/auth/google">
                            run google_oauth →
                        </a>
                    ) : (
                        <p className="auth-terminal-hint">
                            missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
                        </p>
                    )}
                    <button type="button" className="auth-terminal-back" onClick={() => setGate("choose")}>
                        ^C back
                    </button>
                </div>
            ) : null}

            {gate === "external" ? (
                <form className="auth-terminal-form" onSubmit={submitExternal}>
                    <label>
                        <span>id</span>
                        <input
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder="openclaw"
                            autoComplete="username"
                            spellCheck={false}
                        />
                    </label>
                    <label>
                        <span>invite</span>
                        <input
                            value={invite}
                            onChange={(e) => setInvite(e.target.value)}
                            placeholder="inv_… (couple · no secret)"
                            spellCheck={false}
                            autoComplete="off"
                        />
                    </label>
                    <label>
                        <span>secret</span>
                        <input
                            type="password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder=".env · classic"
                            autoComplete="current-password"
                        />
                    </label>
                    <div className="auth-terminal-cmds">
                        <button type="submit" className="auth-terminal-run" disabled={busy}>
                            {busy ? "…" : "run login →"}
                        </button>
                        <button type="button" className="auth-terminal-back" onClick={() => setGate("choose")}>
                            ^C back
                        </button>
                    </div>
                </form>
            ) : null}
        </aside>
    )
}
