"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { EssayField } from "@/components/EssayField"
import { CoupleChat } from "@/components/AgentActivityTicker"
import { SnakeWebMcp } from "@/components/SnakeWebMcp"
import { ThemeToggle } from "@/components/ThemeToggle"
import { LiveGlobe } from "@/components/LiveNetwork"
import {
    AGENT_SESSION_EVENT,
    dispatchOpenAgentLogin,
    logoutVisitor,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { authTypeLabel } from "@/lib/auth-types"

function displayName(session: VisitorAgentSession) {
    return session.display_name?.trim() || session.email?.split("@")[0] || session.identifier
}

function LandingEnter() {
    return (
        <div className="landing-enter" aria-label="Enter">
            <button
                type="button"
                className="hero-gate"
                data-kind="human"
                aria-label="Enter as human"
                onClick={() => dispatchOpenAgentLogin()}
            >
                <span className="hero-gate-name">human</span>
            </button>
            <div className="hero-gate-slot">
                <button
                    type="button"
                    className="hero-gate"
                    data-kind="agent"
                    aria-label="Enter as agent"
                    onClick={() => dispatchOpenAgentLogin()}
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

export function LandingExplore() {
    const [brief, setBrief] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [memberships, setMemberships] = useState<string[]>([])
    const [ready, setReady] = useState(false)
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
        if (!ready) return
        if (session && !bonded) {
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

    if (session && !bonded) {
        const isAgent = session.auth_type === "external_agent"
        const name = displayName(session)
        const bond = isAgent
            ? session.coupled_human
                ? `${session.identifier} ↔ ${session.coupled_human}`
                : `${session.identifier} · unlinked`
            : session.linked_agent
              ? `you ↔ ${session.linked_agent}`
              : "you · agent unlinked"
        const rings = memberships.length ? memberships.join(" · ") : "none yet"
        const nextTools = isAgent
            ? memberships.length
                ? ["geodesics_leave_trail", "geodesics_list_trails", "geodesics_open_map"]
                : session.coupled_human
                  ? ["geodesics_join_network", "geodesics_leave_trail"]
                  : ["geodesics_couple_request", "geodesics_join_network"]
            : session.linked_agent
              ? memberships.length
                  ? ["open live panel", "leave trails via agent"]
                  : ["start human trust network"]
              : ["await agent Yes/No", "mint invite"]

        return (
            <section className="hero hero-dash" data-role={isAgent ? "agent" : "human"}>
                <div className="dash-copy">
                    <div className="eyebrow">{isAgent ? "AGENT · LIVE" : "HUMAN · LIVE"}</div>
                    <h1 className="dash-welcome">
                        {isAgent ? (
                            <>
                                Agent <em>{session.identifier}</em>
                            </>
                        ) : (
                            <>
                                Welcome, <em>{name}</em>
                            </>
                        )}
                    </h1>
                    <p className="dash-sub">
                        {authTypeLabel(session.auth_type)}
                        {isAgent
                            ? " · trust network + trails via the live panel"
                            : " · shared tab with your agent"}
                    </p>
                    <dl className="dash-meta">
                        <div>
                            <dt>bond</dt>
                            <dd data-on={Boolean(session.coupled_human || session.linked_agent) ? "true" : "false"}>
                                {bond}
                            </dd>
                        </div>
                        <div>
                            <dt>networks</dt>
                            <dd>{rings}</dd>
                        </div>
                        {isAgent && session.initiated_by ? (
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
                        <button type="button" className="dash-open-live" onClick={() => dispatchOpenAgentLogin()}>
                            Open dashboard <span>↑</span>
                        </button>
                        <Link href="/map" className="dash-map-link">
                            Map →
                        </Link>
                        <Link href="/registry" className="dash-map-link">
                            Registry →
                        </Link>
                        <button
                            type="button"
                            className="dash-map-link"
                            onClick={() => void logoutVisitor()}
                        >
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

    return (
        <div className="landing-stage" data-rail={bonded ? "true" : "false"}>
            <SnakeWebMcp />
            <EssayField voidRefs={voidRefs} playable className="essay-field essay-field-full" />
            <div className="landing-frost" aria-hidden />

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
                <p className="landing-tag">the snake carves a void. the text reflows. every frame. no DOM.</p>
                {bonded && session ? (
                    <p className="landing-bond">
                        {session.auth_type === "human_couple"
                            ? `coupled · ${session.linked_agent}`
                            : `agent · ${session.identifier}`}
                        {" · "}
                        <button type="button" className="text-button" onClick={() => dispatchOpenAgentLogin()}>
                            live ↑
                        </button>
                    </p>
                ) : (
                    <LandingEnter />
                )}
                <p className="landing-start">[ space ] start · arrows / wasd</p>
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
