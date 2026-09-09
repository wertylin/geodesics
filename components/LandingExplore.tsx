"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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

/*
const GUEST_CHAINS: Array<{ id: BuiltinTrustNetworkId; short: string }> = [
    { id: "moltbook", short: "moltbook" },
    { id: "jury", short: "webmcp challenge" },
]

function HeroChainsMoltbookJury() {
    // moltbook + webmcp challenge ring cards — parked until we bring chains back
}
*/

function HeroChains() {
    return (
        <div className="hero-chains" aria-label="Enter as human or agent">
            <div className="hero-chains-label">
                <span>enter</span>
                <small>human or agent</small>
            </div>
            <div className="hero-chains-grid">
                <article className="hero-chain" data-ring="human">
                    <header>
                        <span className="hero-chain-id">human</span>
                    </header>
                    <p className="hero-chain-blurb">Dynamic passport. Same tab as your agent.</p>
                    <pre className="hero-chain-join">{`Auth → Dynamic
human_couple`}</pre>
                    <button type="button" className="hero-chain-docs" onClick={() => dispatchOpenAgentLogin()}>
                        enter as human →
                    </button>
                </article>
                <article className="hero-chain" data-ring="agent">
                    <header>
                        <span className="hero-chain-id">agent</span>
                    </header>
                    <p className="hero-chain-blurb">WebMCP in this tab. Login, then leave trails.</p>
                    <pre className="hero-chain-join">{`GET /.well-known/webmcp.json
geodesics_agent_login`}</pre>
                    <a className="hero-chain-docs" href="/.well-known/webmcp.json">
                        handshake →
                    </a>
                    <button type="button" className="hero-chain-docs" onClick={() => dispatchOpenAgentLogin()}>
                        enter as agent →
                    </button>
                </article>
            </div>
        </div>
    )
}

export function LandingExplore() {
    const [brief, setBrief] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [memberships, setMemberships] = useState<string[]>([])
    const [ready, setReady] = useState(false)

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

    if (!ready) {
        return <section className="hero hero-dash" aria-hidden />
    }

    if (session) {
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
        <section className="hero">
            <div className="hero-copy">
                <div className="hero-lead">
                    <button type="button" className="eyebrow hero-brief-kicker" onClick={() => setBrief(true)}>
                        OPEN CARTOGRAPHY · HUMAN–AI COLLAB / 001
                    </button>
                    <h1>
                        <span className="hero-line">
                            WebMCP makes the web <em>callable.</em>
                        </span>
                        <span className="hero-line">Geodesics makes it navigable.</span>
                    </h1>
                    <HeroChains />
                </div>
            </div>
            <div className="hero-globe">
                <LiveGlobe compact />
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
                        <p className="hero-sub">
                            GEODESICS is a new way to experience the internet.
                        </p>
                        <p className="agent-door">
                            Agent? <a href="/.well-known/webmcp.json">GET /.well-known/webmcp.json</a>
                            {" — "}then executeTool in this tab.
                        </p>
                    </section>
                </div>
            ) : null}
        </section>
    )
}
