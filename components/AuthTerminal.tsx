"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
    AGENT_OPEN_LOGIN_EVENT,
    AGENT_SESSION_EVENT,
    clearVisitorAgentSession,
    completeAgentLogin,
    hydrateVisitorSession,
    logoutVisitor,
    readAuthLoginIntent,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type AuthLoginIntent,
    type OpenAgentLoginDetail,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { DynamicHumanAuth } from "@/components/DynamicHumanAuth"
import { DynamicWalletLine } from "@/components/DynamicWalletLine"
import { logoutDynamicPassport, useDynamicPassportReady } from "@/components/DynamicRoot"
import { isWebMcpBrowserApiAvailable } from "@/lib/webmcp-page-agent"

type Gate = "human" | "agent"

function intentToGate(intent: AuthLoginIntent | null): Gate {
    return intent === "agent" ? "agent" : "human"
}

/** Bottom-dock terminal — OTP-first human; agent couple panel; secret advanced. */
export function AuthTerminal({ initialIntent = null }: { initialIntent?: AuthLoginIntent | null }) {
    const [gate, setGate] = useState<Gate>(() => intentToGate(initialIntent ?? readAuthLoginIntent()))
    const [advanced, setAdvanced] = useState(false)
    const [identifier, setIdentifier] = useState("")
    const [secret, setSecret] = useState("")
    const [invite, setInvite] = useState("")
    const [busy, setBusy] = useState(false)
    const [line, setLine] = useState("awaiting passport…")
    const [googleOk, setGoogleOk] = useState<boolean | null>(null)
    const [dynamicOk, setDynamicOk] = useState<boolean | null>(null)
    const [webMcp, setWebMcp] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [authError, setAuthError] = useState<string | null>(null)
    const passportReady = useDynamicPassportReady()

    useEffect(() => {
        setSession(readVisitorAgentSession())
        setWebMcp(isWebMcpBrowserApiAvailable())
        const onSession = (e: Event) => {
            setSession((e as CustomEvent<VisitorAgentSession | null>).detail ?? null)
        }
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<OpenAgentLoginDetail>).detail
            const next = detail?.intent ?? readAuthLoginIntent()
            if (next === "human" || next === "agent") setGate(next)
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        window.addEventListener(AGENT_OPEN_LOGIN_EVENT, onOpen)
        return () => {
            window.removeEventListener(AGENT_SESSION_EVENT, onSession)
            window.removeEventListener(AGENT_OPEN_LOGIN_EVENT, onOpen)
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const err = new URLSearchParams(window.location.search).get("auth_error")
        if (!err) return
        setAuthError(decodeURIComponent(err))
        setGate("human")
        setLine(`auth_error: ${decodeURIComponent(err)}`)
        const url = new URL(window.location.href)
        url.searchParams.delete("auth_error")
        window.history.replaceState({}, "", url.pathname + url.search + url.hash)
    }, [])

    useEffect(() => {
        let cancelled = false
        void fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
            .then((r) => r.json())
            .then((d: { google_configured?: boolean; dynamic_configured?: boolean; session?: Record<string, unknown> | null }) => {
                if (cancelled) return
                setGoogleOk(Boolean(d.google_configured))
                setDynamicOk(Boolean(d.dynamic_configured))
                if (!d.session) {
                    if (!window.location.pathname.startsWith("/auth/callback")) {
                        if (readVisitorAgentSession()) clearVisitorAgentSession()
                        setSession(null)
                    }
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
                if (!cancelled) {
                    setGoogleOk(false)
                    setDynamicOk(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    const submitAgent = useCallback(
        async (e: FormEvent) => {
            e.preventDefault()
            const id = identifier.trim()
            const sec = secret.trim()
            const inv = invite.trim()
            if (!id) {
                setLine("error: identifier required")
                return
            }
            if (!sec && !inv) {
                setLine("error: pass invite (couple) — or secret under advanced")
                return
            }
            setBusy(true)
            setLine(inv ? `couple · ${id}` : `secret · ${id}`)
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
                setLine(`ok · ${next.identifier} · ${String(data.path ?? "couple")}`)
            } catch (err) {
                setLine(`err · ${err instanceof Error ? err.message : "login failed"}`)
            } finally {
                setBusy(false)
            }
        },
        [identifier, secret, invite]
    )

    if (session) {
        const waiting =
            session.auth_type === "human_couple" && !session.linked_agent
                ? "passport ok · couple your agent (mint invite in live / same-tab linked)"
                : session.auth_type === "external_agent" && !session.coupled_human
                  ? "agent ok · request couple or join a ring"
                  : "coupled · live"
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
via        ${session.initiated_by}
coupled    ${session.coupled_human || session.linked_agent || "—"}
webmcp     ${webMcp ? "ready" : "page registry"}
next       ${waiting}`}</pre>
                {session.initiated_by === "dynamic" ? <DynamicWalletLine /> : null}
                <div className="auth-terminal-cmds">
                    <button
                        type="button"
                        onClick={() => {
                            void logoutVisitor()
                                .then(() => logoutDynamicPassport())
                                .then(() => setSession(null))
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
                <span>{gate === "human" ? "enter · human" : "enter · agent"}</span>
                <small>guest</small>
            </div>

            <pre className="auth-terminal-out">
                {gate === "human"
                    ? `# Dynamic passport — email code, no wallet install
# status  ${line}
# webmcp  ${webMcp ? "ready" : "page registry"}`
                    : `# Same tab as your human, or paste invite
# executeTool("geodesics_agent_login", { identifier, invite })
# or { mode: "linked" } after bond
# status  ${line}
# webmcp  ${webMcp ? "ready" : "page registry"}`}
            </pre>

            <div className="auth-terminal-cmds">
                <button type="button" data-on={gate === "human" ? "true" : undefined} onClick={() => setGate("human")}>
                    human
                </button>
                <button type="button" data-on={gate === "agent" ? "true" : undefined} onClick={() => setGate("agent")}>
                    agent
                </button>
            </div>

            {gate === "human" ? (
                <div className="auth-terminal-cmds">
                    {authError ? (
                        <p className="auth-terminal-hint">
                            oauth failed: {authError}
                            {authError.includes("redirect") || authError === "redirect_uri_mismatch"
                                ? " — add http://localhost:3000/api/auth/google/callback in Google Cloud Console"
                                : authError === "db_timeout"
                                  ? " — DB hung; restart `next dev` and retry"
                                  : ""}
                        </p>
                    ) : null}
                    {dynamicOk && !passportReady ? (
                        <p className="auth-terminal-hint">booting passport…</p>
                    ) : null}
                    {dynamicOk && passportReady ? <DynamicHumanAuth onStatus={setLine} /> : null}
                    {dynamicOk === false ? (
                        <p className="auth-terminal-hint">
                            Dynamic off — set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID + GEODESICS_AUTH_SECRET
                        </p>
                    ) : null}
                    {googleOk ? (
                        <a className="auth-terminal-run" href="/api/auth/google">
                            or continue with Google →
                        </a>
                    ) : null}
                </div>
            ) : (
                <form className="auth-terminal-form" onSubmit={submitAgent}>
                    <p className="auth-terminal-hint" style={{ color: "var(--muted)" }}>
                        Prefer WebMCP on this origin. Form below is for invite paste.
                    </p>
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
                            placeholder="inv_… from your human"
                            spellCheck={false}
                            autoComplete="off"
                        />
                    </label>
                    {advanced ? (
                        <label>
                            <span>secret</span>
                            <input
                                type="password"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                placeholder=".env · advanced"
                                autoComplete="current-password"
                            />
                        </label>
                    ) : null}
                    <div className="auth-terminal-cmds">
                        <button type="submit" className="auth-terminal-run" disabled={busy}>
                            {busy ? "…" : "couple login →"}
                        </button>
                        <button type="button" className="auth-terminal-back" onClick={() => setAdvanced((v) => !v)}>
                            {advanced ? "hide advanced ←" : "advanced →"}
                        </button>
                        <a className="auth-terminal-run" href="/.well-known/webmcp.json">
                            webmcp →
                        </a>
                    </div>
                </form>
            )}
        </aside>
    )
}
