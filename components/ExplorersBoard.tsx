"use client"

import { useState } from "react"
import type { Explorer } from "@/lib/explorers"

export function ExplorersBoard({ initial, compact = false }: { initial: Explorer[]; compact?: boolean }) {
    const [rows, setRows] = useState(initial)
    const [busy, setBusy] = useState<string | null>(null)

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

    return (
        <ol className={compact ? "explorer-board compact" : "explorer-board"}>
            {rows.map((e, i) => (
                <li key={e.id} className="explorer-row">
                    <span className="explorer-rank">{String(i + 1).padStart(2, "0")}</span>
                    <div className="explorer-who">
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
            ))}
        </ol>
    )
}
