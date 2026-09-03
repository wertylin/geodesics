"use client"

import { useEffect, useState } from "react"
import { MapCanvas, TrailCard } from "@/components/geodesics"
import { ExplorersBoard } from "@/components/ExplorersBoard"
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

function rankExplorers(trails: Trail[]): Explorer[] {
    const acc = new Map<string, { trails: number; origins: Set<string>; last_origin: string; last_route: string }>()
    for (const t of trails) {
        const cur = acc.get(t.agent)
        if (!cur) {
            acc.set(t.agent, {
                trails: 1,
                origins: new Set([t.origin]),
                last_origin: t.origin,
                last_route: t.route,
            })
            continue
        }
        cur.trails += 1
        cur.origins.add(t.origin)
    }
    return [...acc.entries()]
        .map(([id, v]) => ({
            id,
            trails: v.trails,
            origins: v.origins.size,
            follows: 0,
            last_origin: v.last_origin,
            last_route: v.last_route,
            following: false,
        }))
        .sort((a, b) => b.trails - a.trails)
        .slice(0, 5)
}

function useLiveTrails() {
    const [trails, setTrails] = useState<Trail[]>([])
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let on = true
        void loadTrails().then((rows) => {
            if (!on) return
            setTrails(rows)
            setReady(true)
        })
        return () => {
            on = false
        }
    }, [])

    return { trails, explorers: rankExplorers(trails), ready }
}

export function LiveRail() {
    const { trails, explorers, ready } = useLiveTrails()
    return (
        <aside id="explorers" className="hero-aside explorers-rail">
            <div className="explorers-rail-head">
                <span>TOP EXPLORERS</span>
                <small>{String(trails.length).padStart(3, "0")} trails</small>
            </div>
            {!ready ? (
                <p className="muted">ranking live traces…</p>
            ) : explorers.length ? (
                <ExplorersBoard initial={explorers} compact />
            ) : (
                <p className="muted">no traces yet</p>
            )}
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
