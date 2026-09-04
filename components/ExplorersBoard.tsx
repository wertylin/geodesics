"use client"

import { useEffect, useState } from "react"
import type { Explorer } from "@/lib/explorers"
import { TRUST_RINGS } from "@/lib/trust-rings"

function ringLabel(id: string) {
    return TRUST_RINGS.find((r) => r.id === id)?.label ?? id
}

export function ExplorersBoard({
    initial,
    compact = false,
    dock = false,
}: {
    initial: Explorer[]
    compact?: boolean
    dock?: boolean
}) {
    const [rows, setRows] = useState(initial)
    const [busy, setBusy] = useState<string | null>(null)

    useEffect(() => {
        setRows(initial)
    }, [initial])

    const follow = async (id: string) => {
        setBusy(id)
        try {
            const res = await fetch("/api/explorers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ explorer: id }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                explorers?: Explorer[]
                following?: boolean
                follows?: number
            }
            if (Array.isArray(data.explorers)) {
                setRows(data.explorers)
                return
            }
            if (res.ok) {
                setRows((prev) =>
                    prev
                        .map((e) =>
                            e.id === id
                                ? { ...e, following: Boolean(data.following), follows: Number(data.follows) || 0 }
                                : e
                        )
                        .sort((a, b) => b.follows - a.follows || b.trails - a.trails)
                )
            }
        } finally {
            setBusy(null)
        }
    }

    const cls = ["explorer-board", compact ? "compact" : "", dock ? "dock" : ""].filter(Boolean).join(" ")

    return (
        <ol className={cls}>
            {rows.map((e, i) => {
                const rings = e.networks?.length ? e.networks : []
                return (
                    <li key={e.id} className="explorer-row">
                        <span className="explorer-rank">{String(i + 1).padStart(2, "0")}</span>
                        <div className="explorer-who">
                            {rings.length ? (
                                <div className="explorer-rings">
                                    {rings.map((net) => (
                                        <span key={net} className="explorer-ring" data-ring={net}>
                                            {ringLabel(net)}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            <strong>{e.id}</strong>
                            <small>
                                {String(e.follows).padStart(2, "0")} followers
                                {" · "}
                                {String(e.trails).padStart(2, "0")} trails
                            </small>
                        </div>
                        <button
                            type="button"
                            className={e.following ? "explorer-follow on" : "explorer-follow"}
                            disabled={busy === e.id}
                            onClick={() => follow(e.id)}
                        >
                            {e.following ? "Following" : "Follow"}
                        </button>
                    </li>
                )
            })}
        </ol>
    )
}
