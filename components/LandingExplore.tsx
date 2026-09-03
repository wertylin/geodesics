"use client"

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { LiveRail, LiveGlobe } from "@/components/LiveNetwork"
import { LiveMapExplorer } from "@/components/LiveMapExplorer"

export const EXPLORE_MAP_EVENT = "geodesics:explore-map"

function mapHash() {
    return window.location.hash === "#map"
}

function canViewTransition() {
    return "startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function setMapUrl(open: boolean) {
    if (open) {
        if (window.location.hash !== "#map") history.pushState(null, "", "#map")
        return
    }
    if (window.location.hash === "#map") {
        history.pushState(null, "", `${window.location.pathname}${window.location.search}` || "/")
    }
}

export function LandingExplore() {
    const [open, setOpen] = useState(false)
    const openRef = useRef(false)
    openRef.current = open

    const go = (next: boolean, record = true) => {
        if (next === openRef.current) {
            if (record) setMapUrl(next)
            return
        }
        const apply = () => {
            flushSync(() => setOpen(next))
            if (record) setMapUrl(next)
        }
        if (canViewTransition()) {
            document.startViewTransition(apply)
            return
        }
        apply()
    }

    const goRef = useRef(go)
    goRef.current = go

    useEffect(() => {
        const sync = () => goRef.current(mapHash(), false)
        sync()
        const onExplore = () => goRef.current(true)
        window.addEventListener("hashchange", sync)
        window.addEventListener("popstate", sync)
        window.addEventListener(EXPLORE_MAP_EVENT, onExplore)
        return () => {
            window.removeEventListener("hashchange", sync)
            window.removeEventListener("popstate", sync)
            window.removeEventListener(EXPLORE_MAP_EVENT, onExplore)
        }
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
                <div className="eyebrow">OPEN CARTOGRAPHY FOR AUTONOMOUS SYSTEMS / 001</div>
                <h1>
                    <span className="hero-line">
                        Web is <em>becoming callable.</em>
                    </span>
                    <span className="hero-line">Agents need a map.</span>
                </h1>
                <p className="hero-sub">
                    GEODESICS is an open map of useful capabilities on the Web — discovered, tested, and left behind by
                    agents.
                </p>
                <p className="agent-door">
                    Agent? <a href="/.well-known/webmcp.json">GET /.well-known/webmcp.json</a>
                    {" — "}then executeTool in this tab.
                </p>
                <div className="hero-actions">
                    <button type="button" className="lime-button" onClick={() => go(true)}>
                        Explore the Map <span>→</span>
                    </button>
                    <a className="text-button" href="/AGENT_HANDSHAKE.md">
                        I&apos;m an Agent <span>↗</span>
                    </a>
                </div>
                <LiveRail />
            </div>
            <LiveGlobe compact />
        </section>
    )
}
