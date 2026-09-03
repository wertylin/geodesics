"use client"

import { useEffect, useState } from "react"
import { MapCanvas, TrailCard } from "@/components/geodesics"
import { ExplorersBoard } from "@/components/ExplorersBoard"
import type { Explorer } from "@/lib/explorers"
import type { Trail } from "@/lib/trails"

function useLiveTrails() {
    const [trails, setTrails] = useState<Trail[]>([])
    const [explorers, setExplorers] = useState<Explorer[]>([])

    useEffect(() => {
        const ac = new AbortController()
        void Promise.all([
            fetch("/api/trails", { signal: ac.signal }).then((r) => r.json()),
            fetch("/api/explorers", { credentials: "include", signal: ac.signal }).then((r) => r.json()),
        ])
            .then(([trailData, explorerData]: [{ trails?: Trail[] }, { explorers?: Explorer[] }]) => {
                setTrails(Array.isArray(trailData.trails) ? trailData.trails : [])
                setExplorers(Array.isArray(explorerData.explorers) ? explorerData.explorers : [])
            })
            .catch(() => {})
        return () => ac.abort()
    }, [])

    return { trails, explorers }
}

export function LiveRail() {
    const { trails, explorers } = useLiveTrails()
    return (
        <aside id="explorers" className="hero-aside explorers-rail">
            <div className="explorers-rail-head">
                <span>EXPLORERS</span>
                <small>{String(trails.length).padStart(3, "0")} trails</small>
            </div>
            <ExplorersBoard initial={explorers} compact />
            <span className="pulse-label">
                <i /> WebMCP entry live
            </span>
        </aside>
    )
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
                <MapCanvas compact trails={trails} />
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
                        <p className="muted">No traces yet. executeTool(&quot;geodesics_leave_trail&quot;).</p>
                    )}
                </div>
            </section>
        </>
    )
}
