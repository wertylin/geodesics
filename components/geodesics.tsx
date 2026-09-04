'use client'
import Link from 'next/link'
import { useState } from 'react'
import { type Trail } from '@/lib/trails'
export function Wordmark(){
    return (
        <Link href="/" className="wordmark" aria-label="GEODESICS">
            GEODESICS
        </Link>
    )
}
export function Header(){
    return (
        <header className="site-header">
            <Wordmark />
            <nav className="site-nav" aria-label="Site">
                <a href="https://github.com/wertylin/geodesics" target="_blank" rel="noreferrer">GitHub ↗</a>
                <Link href="/registry">Registry</Link>
                <a href="/.well-known/webmcp.json">WebMCP</a>
                <Link href="/AGENT_HANDSHAKE.md">Handshake</Link>
            </nav>
            <a className="challenge-flag" href="https://webmcp.devpost.com/" target="_blank" rel="noreferrer">
                <i />
                <span className="flag-full">Running for WebMCP Challenge</span>
                <span className="flag-compact">WebMCP</span>
            </a>
        </header>
    )
}
function hostOf(origin: string) {
    return origin.replace(/^https?:\/\//, "").split("/")[0] || origin
}
export function MapCanvas({ compact = false, trails = [] }: { compact?: boolean; trails?: Trail[] }) {
    const live = trails.slice(0, 6)
    const [selected, setSelected] = useState(0)
    return (
        <div className={compact ? "map-canvas compact" : "map-canvas"}>
            <div className="map-grid" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Network map of agent-discovered trails">
                {live.length > 1 ? (
                    <path
                        className="route"
                        d={live
                            .map((t, i) => `${i === 0 ? "M" : "L"}${14 + ((i * 14) % 70)} ${28 + (i % 3) * 22}`)
                            .join(" ")}
                    />
                ) : null}
            </svg>
            {live.map((t, i) => (
                <Link
                    key={t.id}
                    href={`/trail/${t.id}`}
                    aria-label={`Trail ${t.id}`}
                    onClick={() => setSelected(i)}
                    className={`map-node ${i === 0 ? "origin" : "capability"} ${selected === i ? "selected" : ""}`}
                    style={{ left: `${14 + ((i * 14) % 70)}%`, top: `${28 + (i % 3) * 22}%` }}
                >
                    <i />
                    <span>{hostOf(t.origin)}</span>
                </Link>
            ))}
            <div className="coordinates">live trails</div>
            <div className="map-legend">
                <span>
                    <i className="dot lime" /> verified path
                </span>
                <span>
                    <i className="dot dim" /> observed
                </span>
            </div>
            <div className="map-stamp">
                LIVE MAP
                <br />
                <strong>{String(trails.length).padStart(3, "0")}</strong> TRAILS
            </div>
        </div>
    )
}
export function Status({type}:{type:string}){return <span className={`status ${type}`}><b>{type==='changed'?'⚠':'✓'}</b> {type}</span>}
export function TrailCard({trail}:{trail:Trail}){return <Link href={`/trail/${trail.id}`} className="trail-card"><div className="trail-top"><span>TRAIL #{trail.id}</span><Status type={trail.status}/></div><div className="trail-agent">{trail.agent}</div><div className="trail-origin">{trail.origin}</div><div className="trail-route">{trail.route}</div><div className="trail-age">{trail.age}</div></Link>}
export function Footer(){return null}
