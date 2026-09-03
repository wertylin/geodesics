"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Status } from "@/components/geodesics"
import type { Trail } from "@/lib/trails"

function hops(route: string): string[] {
    return route
        .split(/\s*→\s*|\s*>\s*|\s*\.\s+(?=[A-Z])|\s*;\s*|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
}

export function TrailDetail({ trail }: { trail: Trail }) {
    const router = useRouter()
    const route = hops(trail.route)
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [followLabel, setFollowLabel] = useState("Follow this explorer")
    const [error, setError] = useState("")
    const [origin, setOrigin] = useState(trail.origin)
    const [path, setPath] = useState(trail.route)
    const [goal, setGoal] = useState("")
    const [agent, setAgent] = useState("")

    const follow = async () => {
        setBusy(true)
        try {
            const res = await fetch("/api/explorers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ explorer: trail.agent }),
            })
            const data = (await res.json().catch(() => ({}))) as { following?: boolean; error?: string }
            if (!res.ok) {
                setError(data.error || "Follow failed")
                return
            }
            setFollowLabel(data.following ? "Following" : "Follow this explorer")
        } finally {
            setBusy(false)
        }
    }

    const leave = async (e: FormEvent) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
            const res = await fetch("/api/trails", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ origin, route: path, goal, agent: agent || "anonymous" }),
            })
            const data = (await res.json().catch(() => ({}))) as { trail?: Trail; error?: string }
            if (!res.ok || !data.trail?.id) {
                setError(data.error || "Could not leave trail")
                return
            }
            router.push(`/trail/${data.trail.id}`)
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="detail-page">
            <div className="detail-heading">
                <div>
                    <div className="eyebrow">JOURNEY LOG / TRAIL #{trail.id}</div>
                    <h1>
                        {route.map((x, i) => (
                            <span key={`${x}-${i}`}>
                                {i > 0 && <em>→</em>}
                                {x}
                            </span>
                        ))}
                    </h1>
                </div>
                <Status type={trail.status} />
            </div>
            <div className="journey">
                <div className="journey-line" />
                <div className="journey-step">
                    <span className="journey-dot">◎</span>
                    <div>
                        <strong>{trail.origin}</strong>
                        <small>origin</small>
                    </div>
                </div>
                {route.map((step, i) => (
                    <div className="journey-step" key={`${step}-${i}`}>
                        <span className="journey-dot">{String(i + 1).padStart(2, "0")}</span>
                        <div>
                            <strong>{step}</strong>
                            <small>{trail.agent}</small>
                        </div>
                    </div>
                ))}
            </div>
            <aside className="detail-aside">
                <div className="eyebrow">TRAIL METADATA</div>
                <dl>
                    <dt>GOAL</dt>
                    <dd>{trail.goal || "—"}</dd>
                    <dt>ORIGIN</dt>
                    <dd>{trail.origin}</dd>
                    <dt>AGENT</dt>
                    <dd>{trail.agent}</dd>
                    <dt>DISCOVERED</dt>
                    <dd>{trail.age}</dd>
                </dl>
                <button className="lime-button" type="button" disabled={busy} onClick={follow}>
                    {followLabel} <span>→</span>
                </button>
                <button className="outline-button" type="button" onClick={() => setOpen((v) => !v)}>
                    Leave a better trail
                </button>
                {open ? (
                    <form className="agent-form" onSubmit={leave}>
                        <label>
                            Origin
                            <input value={origin} onChange={(e) => setOrigin(e.target.value)} required />
                        </label>
                        <label>
                            Route
                            <input value={path} onChange={(e) => setPath(e.target.value)} required />
                        </label>
                        <label>
                            Goal / note
                            <input value={goal} onChange={(e) => setGoal(e.target.value)} />
                        </label>
                        <label>
                            Agent
                            <input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="optional" />
                        </label>
                        <button className="lime-button" type="submit" disabled={busy || !origin.trim() || !path.trim()}>
                            {busy ? "Writing…" : "Write trail"}
                        </button>
                    </form>
                ) : null}
                {error ? <p className="jury-error">{error}</p> : null}
            </aside>
        </main>
    )
}
