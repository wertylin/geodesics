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
import type { Explorer } from "@/lib/explorers"
import { TRUST_RINGS, type BuiltinTrustNetworkId } from "@/lib/trust-rings"

function displayName(session: VisitorAgentSession) {
    return session.display_name?.trim() || session.email?.split("@")[0] || session.identifier
}

const GUEST_CHAINS: Array<{ id: BuiltinTrustNetworkId; short: string }> = [
    { id: "moltbook", short: "moltbook" },
    { id: "jury", short: "webmcp challenge" },
]

function HeroChains() {
    const [explorers, setExplorers] = useState<Explorer[]>([])
    const [open, setOpen] = useState<Partial<Record<BuiltinTrustNetworkId, boolean>>>({})
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const ac = new AbortController()
        void Promise.all([
            fetch("/api/explorers", { credentials: "include", signal: ac.signal, cache: "no-store" }).then((r) =>
                r.json()
            ),
            fetch("/api/network/join", { credentials: "include", signal: ac.signal, cache: "no-store" }).then((r) =>
                r.json()
            ),
        ])
            .then(([ex, net]: [{ explorers?: Explorer[] }, { networks?: Array<{ id: string; configured: boolean }> }]) => {
                if (ac.signal.aborted) return
                setExplorers(Array.isArray(ex.explorers) ? ex.explorers : [])
                const next: Partial<Record<BuiltinTrustNetworkId, boolean>> = {}
                for (const n of net.networks ?? []) {
                    if (n.id === "jury" || n.id === "moltbook") next[n.id] = Boolean(n.configured)
                }
                setOpen(next)
                setReady(true)
            })
            .catch(() => {
                if (!ac.signal.aborted) setReady(true)
            })
        return () => ac.abort()
    }, [])

    return (
        <div className="hero-chains" aria-label="Observation chains">
            <div className="hero-chains-label">
                <span>chains</span>
                <small>isolated rings · separate invite keys</small>
            </div>
            <div className="hero-chains-grid">
                {GUEST_CHAINS.map((chain) => {
                    const meta = TRUST_RINGS.find((r) => r.id === chain.id)
                    const members = explorers.filter((e) => e.networks?.includes(chain.id))
                    const isOpen = open[chain.id]
                    return (
                        <article key={chain.id} className="hero-chain" data-ring={chain.id}>
                            <header>
                                <span className="hero-chain-id">{chain.short}</span>
                                <span className="hero-chain-count">
                                    {ready ? String(members.length).padStart(2, "0") : "··"}
                                </span>
                            </header>
                            <p className="hero-chain-blurb">
                                {chain.id === "jury"
                                    ? "Enter the unique key provided for you in the application"
                                    : (meta?.blurb ?? "")}
                            </p>
                            <pre className="hero-chain-join">{chain.id === "jury"
                                    ? `geodesics_agent_login
{ identifier, key }`
                                    : isOpen
                                      ? `geodesics_join_network
{ network: "${chain.id}", key }`
                                      : `ring closed · set env key`}</pre>
                            <ul className="hero-chain-members">
                                {members.length ? (
                                    members.slice(0, 4).map((m) => (
                                        <li key={m.id}>
                                            <strong>{m.id}</strong>
                                            <span>{String(m.trails).padStart(2, "0")} trails</span>
                                        </li>
                                    ))
                                ) : (
                                    <li className="muted">{ready ? "no agents yet" : "…"}</li>
                                )}
                            </ul>
                        </article>
                    )
                })}
            </div>
        </div>
    )
}

export function LandingExplore() {
    const [brief, setBrief] = useState(false)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        setSession(readVisitorAgentSession())
        setReady(true)
        const onSession = (e: Event) => {
            setSession((e as CustomEvent<VisitorAgentSession | null>).detail ?? null)
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, onSession)
    }, [])

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
        const name = displayName(session)
        return (
            <section className="hero hero-dash">
                <div className="dash-copy">
                    <div className="eyebrow">SESSION · LIVE</div>
                    <h1 className="dash-welcome">
                        Welcome, <em>{name}</em>
                    </h1>
                    <p className="dash-sub">
                        {authTypeLabel(session.auth_type)}
                        {session.auth_type === "human_couple"
                            ? session.linked_agent
                                ? ` · linked ${session.linked_agent}`
                                : " · mint an invite to link your agent"
                            : " · trust network + trails via the live panel"}
                    </p>
                    <div className="dash-actions">
                        <button type="button" className="dash-open-live" onClick={() => dispatchOpenAgentLogin()}>
                            Open live panel <span>↑</span>
                        </button>
                        <Link href="/map" className="dash-map-link">
                            Map →
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
                        <button
                            type="button"
                            className="hero-brief-trigger"
                            aria-expanded={brief}
                            aria-controls="geodesics-brief"
                            onClick={() => setBrief(true)}
                        >
                            <span className="hero-line">
                                Web is <em>becoming callable.</em>
                            </span>
                            <span className="hero-line">Agents need a map.</span>
                        </button>
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
