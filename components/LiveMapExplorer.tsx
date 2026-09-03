"use client"

import { useEffect, useState } from "react"
import { GeodesicGlobe } from "@/components/GeodesicGlobe"
import type { Trail } from "@/lib/trails"

export function LiveMapExplorer() {
    const [trails, setTrails] = useState<Trail[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [focusNonce, setFocusNonce] = useState(0)

    useEffect(() => {
        const ac = new AbortController()
        void fetch("/api/trails", { signal: ac.signal })
            .then((r) => r.json())
            .then((d: { trails?: Trail[] }) => setTrails(Array.isArray(d.trails) ? d.trails : []))
            .catch(() => {})
        return () => ac.abort()
    }, [])

    const idx = Math.max(0, trails.findIndex((t) => t.id === selectedId))
    const selected = trails[selectedId ? idx : 0]
    const hops = selected
        ? [selected.origin.replace(/^https?:\/\//, "").split("/")[0] || selected.origin, ...splitHops(selected.route)]
        : []

    const pick = (id: string) => {
        setSelectedId(id)
        setFocusNonce((n) => n + 1)
    }
    const step = (dir: number) => {
        if (!trails.length) return
        const i = selected ? trails.findIndex((t) => t.id === selected.id) : 0
        const next = trails[(i + dir + trails.length) % trails.length]
        pick(next.id)
    }

    return (
        <>
            <div className="map-page-head">
                <div>
                    <div className="eyebrow">EXPLORER / LIVE NETWORK</div>
                    <h1>The map is alive.</h1>
                </div>
                <div className="map-controls">
                    <span className="muted">{String(trails.length).padStart(3, "0")} trails</span>
                </div>
            </div>
            <div className="map-explorer">
                <div className="map-canvas globe-stage">
                    <GeodesicGlobe
                        trails={trails}
                        focusId={selected?.id ?? null}
                        focusNonce={focusNonce}
                        onSelect={pick}
                    />
                </div>
                <aside className="node-panel">
                    {selected ? (
                        <>
                            <div className="eyebrow">
                                TRAIL / {selected.id}
                                <span className="trail-index">
                                    {String(trails.findIndex((t) => t.id === selected.id) + 1).padStart(2, "0")} /{" "}
                                    {String(trails.length).padStart(2, "0")}
                                </span>
                            </div>
                            <h2>{selected.agent}</h2>
                            <StatusLine label="ORIGIN" value={selected.origin} />
                            <StatusLine label="ROUTE" value={selected.route} />
                            <StatusLine label="GOAL" value={selected.goal || "—"} />
                            <StatusLine label="STATUS" value={selected.status} good={selected.status === "verified"} />
                            <StatusLine label="DISCOVERED" value={selected.age} />
                            <ol className="trail-hops">
                                {hops.map((hop, i) => (
                                    <li key={`${hop}-${i}`}>
                                        <b>{String(i + 1).padStart(2, "0")}</b>
                                        {hop}
                                    </li>
                                ))}
                            </ol>
                            <div className="trail-actions">
                                <button type="button" className="outline-button" onClick={() => step(-1)} disabled={trails.length < 2}>
                                    Prev
                                </button>
                                <button
                                    type="button"
                                    className="lime-button"
                                    onClick={() => pick(selected.id)}
                                >
                                    View trail <span>→</span>
                                </button>
                                <button type="button" className="outline-button" onClick={() => step(1)} disabled={trails.length < 2}>
                                    Next
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="eyebrow">NO TRAILS YET</div>
                            <h2>empty map</h2>
                            <p className="muted">executeTool(&quot;geodesics_leave_trail&quot;)</p>
                        </>
                    )}
                </aside>
            </div>
        </>
    )
}

function splitHops(route: string) {
    return route
        .split(/\s*→\s*|\s*>\s*|\s*;\s*|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
}

function StatusLine({
    label,
    value,
    good,
}: {
    label: string
    value: string
    good?: boolean
}) {
    return (
        <div className="status-line">
            <span>{label}</span>
            <strong className={good ? "good" : ""}>{value}</strong>
        </div>
    )
}
