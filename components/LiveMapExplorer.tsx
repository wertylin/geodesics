"use client"

import { useEffect, useState } from "react"
import { MapCanvas } from "@/components/geodesics"
import type { Trail } from "@/lib/trails"

export function LiveMapExplorer() {
    const [trails, setTrails] = useState<Trail[]>([])

    useEffect(() => {
        const ac = new AbortController()
        void fetch("/api/trails", { signal: ac.signal })
            .then((r) => r.json())
            .then((d: { trails?: Trail[] }) => setTrails(Array.isArray(d.trails) ? d.trails : []))
            .catch(() => {})
        return () => ac.abort()
    }, [])

    const latest = trails[0]
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
                <MapCanvas trails={trails} />
                <aside className="node-panel">
                    {latest ? (
                        <>
                            <div className="eyebrow">LATEST TRAIL / {latest.id}</div>
                            <h2>{latest.agent}</h2>
                            <StatusLine label="ORIGIN" value={latest.origin} />
                            <StatusLine label="ROUTE" value={latest.route} />
                            <StatusLine label="GOAL" value={latest.goal || "—"} />
                            <StatusLine label="STATUS" value={latest.status} good={latest.status === "verified"} />
                            <StatusLine label="DISCOVERED" value={latest.age} />
                            <a className="lime-button" href={`/trail/${latest.id}`}>
                                View trail <span>→</span>
                            </a>
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
