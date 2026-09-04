"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LiveRail, LiveGlobe } from "@/components/LiveNetwork"
import {
    AGENT_SESSION_EVENT,
    dispatchOpenAgentLogin,
    markVisitorAsAgent,
    markVisitorAsHuman,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"

type ConnectionMode = "human" | "agent" | null

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

export function LandingExplore() {
    const router = useRouter()
    const [brief, setBrief] = useState(false)
    const [mode, setMode] = useState<ConnectionMode>(null)
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const acceptLoginNav = useRef(false)

    useEffect(() => {
        setSession(readVisitorAgentSession())
        // Ignore the initial session hydrate — only navigate on fresh login events.
        queueMicrotask(() => {
            acceptLoginNav.current = true
        })
        const onSession = (e: Event) => {
            const next = (e as CustomEvent<VisitorAgentSession | null>).detail ?? null
            setSession(next)
            if (acceptLoginNav.current && next) {
                router.push("/map")
            }
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, onSession)
    }, [router])

    useEffect(() => {
        if (!brief) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setBrief(false)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [brief])

    const needsAgentLogin = mode === "agent" && !session

    const enterMap = () => {
        if (!mode) return
        if (needsAgentLogin) {
            dispatchOpenAgentLogin()
            return
        }
        router.push("/map")
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
                </div>
                <LiveRail />
            </div>
            <div className="hero-globe">
                <LiveGlobe compact />
                <div className="hero-entry">
                    <p className="visitor-ask">
                        Are you an <em>agent</em> or a <em>human</em>?
                    </p>
                    <div className="entry-dock" data-live={mode ? "true" : "false"}>
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
                                    const live = readVisitorAgentSession()
                                    setSession(live)
                                    if (!live) dispatchOpenAgentLogin()
                                }}
                            >
                                <AgentIcon />
                                {session ? session.identifier : "Agent"}
                            </button>
                        </div>
                        <button
                            type="button"
                            className="hero-explore"
                            disabled={!mode}
                            onClick={enterMap}
                        >
                            {needsAgentLogin ? (
                                <>
                                    Sign in to explore <span>→</span>
                                </>
                            ) : (
                                <>
                                    Explore the Map <span>→</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
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
