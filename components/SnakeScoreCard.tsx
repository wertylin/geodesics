"use client"

import { useCallback, useEffect, useState } from "react"
import type { SnakeScoreRow, SnakeSubmitResult } from "@/lib/snake-leaderboard"

type SubmitResult = SnakeSubmitResult & { scores?: SnakeScoreRow[]; error?: string }

type Props = {
    score: number
    name: string
    onResult?: (result: SubmitResult | null) => void
}

/** Card shown over the landing when the snake dies: rank on the leaderboard + top scores. */
export function SnakeScoreCard({ score, name, onResult }: Props) {
    const [result, setResult] = useState<SubmitResult | null>(null)
    const [failed, setFailed] = useState(false)

    const submit = useCallback(async () => {
        setFailed(false)
        try {
            const res = await fetch("/api/snake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ score, name }),
            })
            const data = (await res.json()) as SubmitResult
            setResult(data)
            onResult?.(data)
        } catch {
            setFailed(true)
            onResult?.(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [score, name])

    useEffect(() => {
        void submit()
    }, [submit])

    const rank = result?.rank
    const total = result?.total
    const isRecord = result != null && score > 0 && score >= result.personal_best

    return (
        <div className="snake-score-card" role="dialog" aria-label="Snake score card">
            <div className="snake-score-card-inner">
                <p className="snake-score-card-eyebrow">run over</p>
                <p className="snake-score-card-score">{score}</p>
                <p className="snake-score-card-rank">
                    {failed
                        ? "offline — not submitted"
                        : result == null
                          ? "submitting…"
                          : `leaderboard #${rank}${total ? ` / ${total}` : ""}${isRecord ? " · personal best" : ""}`}
                </p>
                {result?.scores?.length ? (
                    <ol className="snake-leaderboard-list" style={{ margin: "14px 0 0", textAlign: "left" }}>
                        {result.scores.slice(0, 5).map((row, i) => (
                            <li
                                key={row.id}
                                className="snake-leaderboard-row"
                                data-hot={Boolean(result.entry && row.id === result.entry.id)}
                            >
                                <span className="snake-leaderboard-rank">{i + 1}</span>
                                <span className="snake-leaderboard-who">
                                    <strong>{row.name}</strong>
                                    <small>{new Date(row.at).toLocaleTimeString()}</small>
                                </span>
                            </li>
                        ))}
                    </ol>
                ) : null}
                <p className="snake-score-card-hint">space — run it back</p>
            </div>
        </div>
    )
}
