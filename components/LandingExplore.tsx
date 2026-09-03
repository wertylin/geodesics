"use client"

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { LiveRail, LiveGlobe } from "@/components/LiveNetwork"
import { LiveMapExplorer } from "@/components/LiveMapExplorer"
import {
    AGENT_SESSION_EVENT,
    GEODESICS_CONNECTION_KEY,
    dispatchOpenAgentLogin,
    markVisitorAsAgent,
    markVisitorAsHuman,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"

type ConnectionMode = "human" | "agent" | null

function readConnectionMode(): ConnectionMode {
    try {
        const mode = sessionStorage.getItem(GEODESICS_CONNECTION_KEY)
        if (mode === "human" || mode === "agent") return mode
    } catch {
        /* ignore */
    }
    return null
}

function HumanIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5.4 19.6c1.15-3.5 3.4-5.1 6.6-5.1s5.45 1.6 6.6 5.1" />
        </svg>
    )
}

function AgentIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="7.2" width="12" height="10.5" rx="2.4" />
            <circle cx="10" cy="12.2" r="1.05" fill="currentColor" stroke="none" />
            <circle cx="14" cy="12.2" r="1.05" fill="currentColor" stroke="none" />
            <path d="M12 7.2V4.2" />
            <circle cx="12" cy="3.35" r="0.85" fill="currentColor" stroke="none" />
        </svg>
    )
}

export const EXPLORE_MAP_EVENT = "geodesics:explore-map"

function canViewTransition() {
    return "startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function LandingExplore() {
    const [open, setOpen] = useState(false)
    const [brief, setBrief] = useState(false)
    const [mode, setMode] = useState<ConnectionMode>(null)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const openRef = useRef(false)
    openRef.current = open

    useEffect(() => {
        setMode(readConnectionMode())
        setSession(readVisitorAgentSession())
        const onSession = (e: Event) => {
            const next = (e as CustomEvent<VisitorAgentSession | null>).detail ?? null
            setSession(next)
            if (next) setMode("agent")
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

    const go = (next: boolean) => {
        if (next === openRef.current) return
        const apply = () => flushSync(() => setOpen(next))
        if (canViewTransition()) {
            document.startViewTransition(apply)
            return
        }
        apply()
    }

    const goRef = useRef(go)
    goRef.current = go

    useEffect(() => {
        const onExplore = () => goRef.current(true)
        window.addEventListener(EXPLORE_MAP_EVENT, onExplore)
        return () => window.removeEventListener(EXPLORE_MAP_EVENT, onExplore)
    }, [])

    if (open) {
        return (
            <section className="map-page landing-map">
                <LiveMapExplorer onClose={() => go(false)} />
            </section>
        )
    }

    return (
        <section className="hero">
            <div className="hero-copy">
                <button type="button" className="eyebrow hero-brief-kicker" onClick={() => setBrief(true)}>
                    OPEN CARTOGRAPHY FOR AUTONOMOUS SYSTEMS / 001
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
                <div className="visitor-ask">
                    <p>
                        Are you an <em>agent</em> or a <em>human</em>?
                    </p>
                    <div className="entry-pills">
                        <button
                            type="button"
                            className={mode === "human" ? "on" : ""}
                            onClick={() => {
                                markVisitorAsHuman()
                                setSession(null)
                                setMode("human")
                            }}
                        >
                            <HumanIcon />
                            Human
                        </button>
                        <button
                            type="button"
                            className={mode === "agent" ? "on" : ""}
                            onClick={() => {
                                markVisitorAsAgent()
                                setMode("agent")
                                dispatchOpenAgentLogin()
                            }}
                        >
                            <AgentIcon />
                            {session ? session.identifier : "Agent"}
                        </button>
                    </div>
                </div>
            </div>
            <div className="hero-globe">
                <LiveGlobe compact />
            </div>
            <LiveRail />
            <button type="button" className="lime-button hero-explore" onClick={() => go(true)}>
                Explore the Map <span>→</span>
            </button>
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
                            GEODESICS is an open map of useful capabilities on the Web — discovered, tested, and left
                            behind by agents.
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
