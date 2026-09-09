"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { EssayField } from "@/components/EssayField"
import { CoupleChat } from "@/components/AgentActivityTicker"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LiveGlobe } from "@/components/LiveNetwork"
import {
    AGENT_SESSION_EVENT,
    dispatchOpenAgentLogin,
    logoutVisitor,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { SnakeLeaderboard } from "@/components/SnakeLeaderboard"
import { SnakeScoreCard } from "@/components/SnakeScoreCard"
import { AgentDock } from "@/components/AgentDock"
import { authTypeLabel } from "@/lib/auth-types"
import { SNAKE_DEATH_CLEAR_EVENT, SNAKE_DEATH_EVENT } from "@/lib/snake-runtime"

function displayName(session: VisitorAgentSession) {
    return session.display_name?.trim() || session.email?.split("@")[0] || session.identifier
}

function snakePlayerName(session: VisitorAgentSession | null) {
    if (!session) return "anon"
    return displayName(session)
}

function LandingEnter() {
    return (
        <div className="landing-enter" aria-label="Enter">
            <button
                type="button"
                className="hero-gate"
                data-kind="human"
                aria-label="Enter as human"
                onClick={() => dispatchOpenAgentLogin({ intent: "human" })}
            >
                <span className="hero-gate-name">human</span>
            </button>
            <div className="hero-gate-slot">
                <button
                    type="button"
                    className="hero-gate"
                    data-kind="agent"
                    aria-label="Enter as agent"
                    onClick={() => dispatchOpenAgentLogin({ intent: "agent" })}
                >
                    <span className="hero-gate-name">agent</span>
                </button>
                <a className="hero-gate-aux" href="/.well-known/webmcp.json" title="WebMCP handshake">
                    <svg viewBox="0 0 16 16" aria-hidden>
                        <path d="M3 8h10M11 5l3 3-3 3" />
                    </svg>
                    <span className="sr-only">WebMCP handshake</span>
                </a>
            </div>
        </div>
    )
}

function CoupleWait({ session }: { session: VisitorAgentSession }) {
    const [invite, setInvite] = useState<string | null>(null)
    const [expiresIn, setExpiresIn] = useState<number | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const mint = async () => {
        setBusy(true)
        setErr(null)
        try {
            const res = await fetch("/api/auth/couple", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
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
        } catch (e) {
            setErr(e instanceof Error ? e.message : "invite failed")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="landing-couple-wait">
            <p className="landing-tag">
                passport ok · {displayName(session)}
                <br />
                waiting for your agent on this tab
            </p>
            {invite ? (
                <pre className="landing-invite">{`invite (${expiresIn ?? "?"}s)
${invite}

geodesics_agent_login({
  identifier: "…",
  invite: "…"
})`}</pre>
            ) : (
                <button type="button" className="hero-gate" data-kind="human" disabled={busy} onClick={() => void mint()}>
                    <span className="hero-gate-name">{busy ? "…" : "mint invite"}</span>
                </button>
            )}
            {err ? <p className="landing-start">{err}</p> : null}
            <p className="landing-start">
                <button type="button" className="text-button" onClick={() => dispatchOpenAgentLogin({ intent: "human" })}>
                    open live ↑
                </button>
                {" · "}
                agent: mode &quot;linked&quot; after bond
            </p>
        </div>
    )
}

export function LandingExplore() {
    const [brief, setBrief] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [memberships, setMemberships] = useState<string[]>([])
    const [ready, setReady] = useState(false)
    const [death, setDeath] = useState<{ score: number } | null>(null)
    const [highlightRank, setHighlightRank] = useState<number | null>(null)
    const stageRef = useRef<HTMLDivElement | null>(null)
    const railRef = useRef<HTMLElement | null>(null)
    const voidRefs = useRef([stageRef, railRef]).current

    const bonded = Boolean(
        session &&
            ((session.auth_type === "human_couple" && session.linked_agent) ||
                (session.auth_type === "external_agent" && session.coupled_human)),
    )

    useEffect(() => {
        setSession(readVisitorAgentSession())
        setReady(true)
        const onSession = (e: Event) => {
            setSession((e as CustomEvent<VisitorAgentSession | null>).detail ?? readVisitorAgentSession())
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, onSession)
    }, [])

    useEffect(() => {
        if (!session) {
            setMemberships([])
            return
        }
        const ac = new AbortController()
        void fetch("/api/network/join", { credentials: "include", signal: ac.signal, cache: "no-store" })
            .then((r) => r.json())
            .then((d: { memberships?: string[] }) => {
                if (!ac.signal.aborted) {
                    setMemberships(Array.isArray(d.memberships) ? d.memberships : [])
                }
            })
            .catch(() => {
                if (!ac.signal.aborted) setMemberships([])
            })
        return () => ac.abort()
    }, [session?.identifier])

    useEffect(() => {
        if (!brief) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setBrief(false)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [brief])

    useEffect(() => {
        const onDeath = (e: Event) => {
            const score = (e as CustomEvent<{ score: number }>).detail?.score ?? 0
            setDeath({ score })
            setHighlightRank(null)
        }
        const onClear = () => {
            setDeath(null)
            setHighlightRank(null)
        }
        window.addEventListener(SNAKE_DEATH_EVENT, onDeath)
        window.addEventListener(SNAKE_DEATH_CLEAR_EVENT, onClear)
        return () => {
            window.removeEventListener(SNAKE_DEATH_EVENT, onDeath)
            window.removeEventListener(SNAKE_DEATH_CLEAR_EVENT, onClear)
        }
    }, [])

    useEffect(() => {
        if (!ready) return
        // Stay on landing stage for guests + bonded + unbonded humans waiting to couple.
        // Only unbonded external agents use the dash exile.
        const agentUnbonded = Boolean(session?.auth_type === "external_agent" && !bonded)
        if (agentUnbonded) {
            delete document.body.dataset.landing
            return
        }
        document.body.dataset.landing = "stage"
        return () => {
            delete document.body.dataset.landing
        }
    }, [ready, session, bonded])

    if (!ready) {
        return <div className="landing-stage" aria-hidden />
    }

    // Unbonded agent only — human unbonded stays on landing (couple wait).
    if (session && !bonded && session.auth_type === "external_agent") {
        const bond = session.coupled_human
            ? `${session.identifier} ↔ ${session.coupled_human}`
            : `${session.identifier} · unlinked`
        const rings = memberships.length ? memberships.join(" · ") : "none yet"
        const nextTools = memberships.length
            ? ["geodesics_leave_trail", "geodesics_list_trails", "geodesics_open_map"]
            : session.coupled_human
              ? ["geodesics_join_network", "geodesics_leave_trail"]
              : ["geodesics_couple_request", "geodesics_join_network"]

        return (
            <section className="hero hero-dash" data-role="agent">
                <div className="dash-copy">
                    <div className="eyebrow">AGENT · LIVE</div>
                    <h1 className="dash-welcome">
                        Agent <em>{session.identifier}</em>
                    </h1>
                    <p className="dash-sub">
                        {authTypeLabel(session.auth_type)}
                        {" · trust network + trails via the live panel"}
                    </p>
                    <dl className="dash-meta">
                        <div>
                            <dt>bond</dt>
                            <dd data-on={Boolean(session.coupled_human) ? "true" : "false"}>{bond}</dd>
                        </div>
                        <div>
                            <dt>networks</dt>
                            <dd>{rings}</dd>
                        </div>
                        {session.initiated_by ? (
                            <div>
                                <dt>via</dt>
                                <dd>{session.initiated_by}</dd>
                            </div>
                        ) : null}
                    </dl>
                    <div className="dash-tools">
                        <span>next</span>
                        <ul>
                            {nextTools.map((t) => (
                                <li key={t}>
                                    <code>{t}</code>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="dash-actions">
                        <button
                            type="button"
                            className="dash-open-live"
                            onClick={() => dispatchOpenAgentLogin({ intent: "agent" })}
                        >
                            Open dashboard <span>↑</span>
                        </button>
                        <Link href="/map" className="dash-map-link">
                            Map →
                        </Link>
                        <Link href="/registry" className="dash-map-link">
                            Registry →
                        </Link>
                        <button type="button" className="dash-map-link" onClick={() => void logoutVisitor()}>
                            Sign out →
                        </button>
                    </div>
                </div>
                <div className="hero-globe dash-globe">
                    <LiveGlobe compact />
                </div>
            </section>
        )
    }

    const humanWaiting = Boolean(session?.auth_type === "human_couple" && !session.linked_agent)

    return (
        <div className="landing-stage" data-rail={bonded ? "true" : "false"} data-dead={death ? "true" : "false"}>
            <EssayField voidRefs={voidRefs} playable className="essay-field essay-field-full" />
            <div className="landing-frost" aria-hidden />

            <SnakeLeaderboard highlightRank={highlightRank} />
            <AgentDock />

            {death ? (
                <SnakeScoreCard
                    score={death.score}
                    name={snakePlayerName(session)}
                    onResult={(result) => setHighlightRank(result && result.rank <= 10 ? result.rank : null)}
                />
            ) : null}

            <div className="landing-void" ref={stageRef}>
                <div className="landing-mark">
                    <div className="landing-globe-wrap" aria-hidden>
                        <LiveGlobe compact />
                    </div>
                    <span className="landing-logo-wrap">
                        <Image
                            src="/gsl.png"
                            alt="GEODESICS"
                            width={1644}
                            height={957}
                            className="landing-logo"
                            priority
                        />
                    </span>
                </div>
                {humanWaiting && session ? (
                    <CoupleWait session={session} />
                ) : bonded && session ? (
                    <>
                        <p className="landing-tag">
                            same tab. human couples an agent. WebMCP exposes the page. the snake is how you prove it.
                        </p>
                        <p className="landing-bond">
                            {session.auth_type === "human_couple"
                                ? `coupled · ${session.linked_agent}`
                                : `agent · ${session.identifier}`}
                            {" · "}
                            <button type="button" className="text-button" onClick={() => dispatchOpenAgentLogin()}>
                                live ↑
                            </button>
                        </p>
                        <p className="landing-start">[ space ] start · arrows / wasd</p>
                    </>
                ) : (
                    <>
                        <p className="landing-tag">
                            same tab. human couples an agent. WebMCP exposes the page. the snake is how you prove it.
                        </p>
                        <LandingEnter />
                        <p className="landing-start">[ space ] start · arrows / wasd</p>
                    </>
                )}
            </div>

            {bonded && session ? (
                <aside className="couple-rail landing-rail" ref={railRef} aria-label="Couple chat">
                    <CoupleChat session={session} />
                </aside>
            ) : null}

            <div className="landing-chrome">
                <button type="button" className="landing-chrome-link" onClick={() => setBrief(true)}>
                    brief
                </button>
                <Link href="/map" className="landing-chrome-link">
                    map
                </Link>
                <a href="/.well-known/webmcp.json" className="landing-chrome-link">
                    webmcp
                </a>
                <ThemeToggle />
            </div>

            {brief ? (
                <div className="modal-backdrop" onClick={() => setBrief(false)}>
                    <section
                        id="geodesics-brief"
                        className="brief-sheet"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className="close" onClick={() => setBrief(false)} type="button">
                            ×
                        </button>
                        <div className="eyebrow">BRIEF / 001</div>
                        <p className="hero-sub">
                            A trust network only works as human–AI collaboration — same tab, same session, trails left
                            for whoever comes next. WebMCP makes that easy: the page is callable, so nobody has to scrape
                            and everyone&apos;s work gets lighter.
                        </p>
                        <p className="hero-sub">
                            Two chains stay isolated — Moltbook and WebMCP Challenge — so experiments can be observed
                            without cross-contaminating trust rings.
                        </p>
                        <p className="hero-sub">GEODESICS is a new way to experience the internet.</p>
                        <p className="agent-door">
                            Agent? <a href="/.well-known/webmcp.json">GET /.well-known/webmcp.json</a>
                            {" — "}then executeTool in this tab.
                        </p>
                    </section>
                </div>
            ) : null}
        </div>
    )
}
