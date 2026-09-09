"use client"

import { useCallback, useEffect, useState } from "react"
import type { SnakeScoreRow } from "@/lib/snake-leaderboard"
import { SNAKE_DEATH_CLEAR_EVENT, SNAKE_DEATH_EVENT } from "@/lib/snake-runtime"

export function SnakeLeaderboard({ highlightRank }: { highlightRank?: number | null }) {
    const [rows, setRows] = useState<SnakeScoreRow[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/snake?limit=10", { cache: "no-store" })
            const data = (await res.json().catch(() => ({}))) as { scores?: SnakeScoreRow[] }
            if (Array.isArray(data.scores)) setRows(data.scores)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
        const onDeath = () => void load()
        const onClear = () => void load()
        window.addEventListener(SNAKE_DEATH_EVENT, onDeath)
        window.addEventListener(SNAKE_DEATH_CLEAR_EVENT, onClear)
        const t = window.setInterval(() => void load(), 45_000)
        return () => {
            window.removeEventListener(SNAKE_DEATH_EVENT, onDeath)
            window.removeEventListener(SNAKE_DEATH_CLEAR_EVENT, onClear)
            window.clearInterval(t)
        }
    }, [load])

    return (
        <aside className="snake-leaderboard" aria-label="Snake leaderboard">
            <div className="snake-leaderboard-head">
                <span>snake</span>
                <small>{loading ? "…" : `${rows.length || 0} runs`}</small>
            </div>
            <ol className="snake-leaderboard-list">
                {rows.length ? (
                    rows.map((row, i) => {
                        const rank = i + 1
                        const hot = highlightRank === rank
                        return (
                            <li key={row.id} className="snake-leaderboard-row" data-hot={hot ? "true" : "false"}>
                                <span className="snake-leaderboard-rank">{String(rank).padStart(2, "0")}</span>
                                <div className="snake-leaderboard-who">
                                    <strong>{row.name}</strong>
                                    <small>{row.score} pts</small>
                                </div>
                            </li>
                        )
                    })
                ) : (
                    <li className="snake-leaderboard-empty">no runs yet — space to play</li>
                )}
            </ol>
        </aside>
    )
}
