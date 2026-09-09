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
import { DynamicHumanAuth } from "@/components/DynamicHumanAuth"
import { DynamicWalletLine } from "@/components/DynamicWalletLine"
import { logoutDynamicPassport, useDynamicPassportReady } from "@/components/DynamicRoot"
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
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, onSession)
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const err = new URLSearchParams(window.location.search).get("auth_error")
        if (!err) return
        setAuthError(decodeURIComponent(err))
        setGate("couple")
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
                    // Don't wipe mid Google hydrate on /auth/callback — cookie may land a tick late.
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
passport   ${session.initiated_by}
coupled    ${session.coupled_human || session.linked_agent || "—"}
webmcp     ${webMcp ? "ready" : "page registry"}`}</pre>
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
                <span>geodesics auth</span>
                <small>guest</small>
            </div>

            <pre className="auth-terminal-out">
                {`# surfaces
# 1  human_couple   → Dynamic passport (+ Google fallback)
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
                        <p className="auth-terminal-hint">booting Dynamic passport…</p>
                    ) : null}
                    {dynamicOk && passportReady ? <DynamicHumanAuth onStatus={setLine} /> : null}
                    {dynamicOk === false ? (
                        <p className="auth-terminal-hint">
                            Dynamic off — set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID + GEODESICS_AUTH_SECRET,
                            enable Email OTP + EVM + embedded wallets, allowlist this origin
                        </p>
                    ) : null}
                    {googleOk === null ? (
                        <p className="auth-terminal-hint">checking google oauth fallback…</p>
                    ) : googleOk ? (
                        <a className="auth-terminal-run" href="/api/auth/google">
                            fallback google_oauth →
                        </a>
                    ) : (
                        <p className="auth-terminal-hint">google oauth fallback off</p>
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
