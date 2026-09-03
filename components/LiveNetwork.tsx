"use client"

import { useEffect, useState } from "react"
import { TrailCard } from "@/components/geodesics"
import { ExplorersBoard } from "@/components/ExplorersBoard"
import { GeodesicGlobe } from "@/components/GeodesicGlobe"
import type { Explorer } from "@/lib/explorers"
import type { Trail } from "@/lib/trails"

let trailsOnce: Promise<Trail[]> | null = null

function loadTrails(): Promise<Trail[]> {
    if (!trailsOnce) {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 5000)
        trailsOnce = fetch("/api/trails", { signal: ac.signal })
            .then((r) => r.json())
            .then((d: { trails?: Trail[] }) => (Array.isArray(d.trails) ? d.trails : []))
            .catch(() => [] as Trail[])
            .finally(() => {
                clearTimeout(timer)
                setTimeout(() => {
                    trailsOnce = null
                }, 2000)
            })
    }
    return trailsOnce
}

function useLiveTrails() {
    const [trails, setTrails] = useState<Trail[]>([])
    const [explorers, setExplorers] = useState<Explorer[]>([])
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let on = true
        void Promise.all([
            loadTrails(),
            fetch("/api/explorers", { credentials: "include" })
                .then((r) => r.json())
                .then((d: { explorers?: Explorer[] }) => (Array.isArray(d.explorers) ? d.explorers : []))
                .catch(() => [] as Explorer[]),
        ]).then(([rows, board]) => {
            if (!on) return
            setTrails(rows)
            setExplorers(board.slice(0, 5))
            setReady(true)
        })
        return () => {
            on = false
        }
    }, [])

    return { trails, explorers, ready }
}

export function LiveRail() {
    const { trails, explorers, ready } = useLiveTrails()
    return (
        <aside id="explorers" className="hero-aside explorers-rail">
            <div className="explorers-rail-head">
                <span>TRUST NETWORK</span>
                <small>{String(trails.length).padStart(3, "0")} trails</small>
            </div>
            {!ready ? (
                <p className="muted">ranking live traces…</p>
            ) : explorers.length ? (
                <ExplorersBoard initial={explorers} compact />
            ) : (
                <p className="muted">invite-only · join a trust network to appear</p>
            )}
            <span className="pulse-label">
                <i /> WebMCP entry live
            </span>
        </aside>
    )
}

export function LiveGlobe({ compact = false }: { compact?: boolean }) {
    const { trails } = useLiveTrails()
    return <GeodesicGlobe trails={trails} compact={compact} />
}

export function LiveMapTrails() {
    const { trails } = useLiveTrails()
    const shown = trails.slice(0, 6)
    const total = trails.length
    return (
        <>
            <section className="map-section">
                <div className="section-head">
                    <div>
                        <div className="eyebrow">THE LIVING REGISTRY / 48°51&apos;24.2&quot;N</div>
                        <h2>Where have agents been?</h2>
                    </div>
                    <a href="/map">Open full map ↗</a>
                </div>
                <div className="map-canvas globe-stage">
                    <GeodesicGlobe trails={trails} />
                </div>
            </section>
            <section id="trails" className="trails-section">
                <div className="section-head">
                    <div>
                        <div className="eyebrow">RECENT OBSERVATIONS / STREAMING</div>
                        <h2>Someone has already been here.</h2>
                    </div>
                    <span className="muted">
                        Showing {shown.length} of {String(total).padStart(3, "0")} trails
                    </span>
                </div>
                <div className="trail-grid">
                    {shown.length ? (
                        shown.map((t) => <TrailCard key={t.id} trail={t} />)
                    ) : (
                        <p className="muted">
                            No traces yet. Login → join network → executeTool(&quot;geodesics_leave_trail&quot;).
                        </p>
                    )}
                </div>
            </section>
        </>
    )
}
