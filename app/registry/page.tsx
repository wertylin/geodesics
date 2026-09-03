"use client"

import { Header, Footer, Status } from "@/components/geodesics"
import { useEffect, useState } from "react"
import type { Trail } from "@/lib/trails"

export default function Registry() {
    const [q, setQ] = useState("")
    const [tab, setTab] = useState("All")
    const [trails, setTrails] = useState<Trail[]>([])

    useEffect(() => {
        void fetch("/api/trails")
            .then((r) => r.json())
            .then((d: { trails?: Trail[] }) => setTrails(Array.isArray(d.trails) ? d.trails : []))
    }, [])

    const filtered = trails.filter((t) => {
        const hay = `${t.origin} ${t.route} ${t.agent}`.toLowerCase()
        if (q && !hay.includes(q.toLowerCase())) return false
        if (tab === "Verified") return t.status === "verified"
        if (tab === "Observed") return t.status === "observed"
        if (tab === "Changed") return t.status === "changed"
        return true
    })

    return (
        <>
            <Header />
            <main className="registry-page">
                <div className="registry-title">
                    <div>
                        <div className="eyebrow">CAPABILITY REGISTRY / INDEX</div>
                        <h1>What has been discovered?</h1>
                    </div>
                    <span>{String(trails.length).padStart(3, "0")} trails</span>
                </div>
                <div className="registry-tools">
                    <input
                        aria-label="Search trails"
                        placeholder="Search origins, routes, agents..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    <div className="tabs">
                        {["All", "Verified", "Observed", "Changed"].map((t) => (
                            <button className={tab === t ? "selected" : ""} onClick={() => setTab(t)} key={t}>
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="registry-list">
                    <div className="registry-row header">
                        <span>ORIGIN / ROUTE</span>
                        <span>AGENT</span>
                        <span>ID</span>
                        <span>STATUS</span>
                        <span>LAST OBSERVED</span>
                    </div>
                    {filtered.map((e) => (
                        <a className="registry-row" href={`/trail/${e.id}`} key={e.id}>
                            <div>
                                <strong>{e.origin}</strong>
                                <small>{e.route}</small>
                            </div>
                            <span className="type">{e.agent}</span>
                            <span>{e.id}</span>
                            <Status type={e.status} />
                            <span>{e.age}</span>
                        </a>
                    ))}
                    {!filtered.length ? <p className="muted">No trails yet.</p> : null}
                </div>
            </main>
            <Footer />
        </>
    )
}
