"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type ChatMsg = { role: "agent" | "you"; text: string; at: number }

type RunSource = { i: number; c: number; r: number; t: number }

type DeathDetail = { score?: number; sources?: RunSource[] }

const DOCK_OPEN_KEY = "geodesics_dock_open"

/**
 * Right-side agent dock: chat with the landing agent + post-run reasoning.
 * The snake's eaten sources arrive via the death event; reasoning is requested
 * from /api/snake/reasoning and pinned at the top of the feed.
 */
export function AgentDock() {
    const [open, setOpen] = useState(false)
    const [msgs, setMsgs] = useState<ChatMsg[]>([])
    const [reasoning, setReasoning] = useState<string | null>(null)
    const [runMeta, setRunMeta] = useState<{ score: number; sources: number } | null>(null)
    const [input, setInput] = useState("")
    const [busy, setBusy] = useState(false)
    const feedRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        try {
            setOpen(window.localStorage.getItem(DOCK_OPEN_KEY) === "1")
        } catch {
            /* ignore */
        }
    }, [])

    const toggle = useCallback(() => {
        setOpen((v) => {
            try {
                window.localStorage.setItem(DOCK_OPEN_KEY, v ? "0" : "1")
            } catch {
                /* ignore */
            }
            return !v
        })
    }, [])

    useEffect(() => {
        const el = feedRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [msgs, reasoning, open])

    useEffect(() => {
        const onDeath = async (e: Event) => {
            const detail = (e as CustomEvent<{ score?: number; sources?: RunSource[] }>).detail
            const score = Number(detail?.score ?? 0)
            if (score <= 0) return
            setRunMeta({ score, sources: detail?.sources?.length ?? 0 })
            setReasoning("thinking…")
            try {
                const res = await fetch("/api/snake/reasoning", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        score,
                        length: score + 3,
                        sources: detail?.sources ?? [],
                    }),
                })
                const data = (await res.json()) as { reasoning?: string }
                setReasoning(data.reasoning || "…")
                setMsgs((m) => [...m, { role: "agent", text: data.reasoning || "…", at: Date.now() }])
            } catch {
                setReasoning("offline — reasoning unavailable.")
            }
        }
        window.addEventListener("geodesics-snake-death", onDeath)
        return () => window.removeEventListener("geodesics-snake-death", onDeath)
    }, [])

    const send = useCallback(async () => {
        const text = input.trim()
        if (!text || busy) return
        setBusy(true)
        setMsgs((m) => [...m, { role: "you", text, at: Date.now() }])
        setInput("")
        try {
            // Local agent reply: reflect run state + tactics. (No external LLM for chat; deterministic and instant.)
            const lower = text.toLowerCase()
            let reply: string
            if (lower.includes("skor") || lower.includes("score")) {
                reply = "son run hafızamda. flood-fill + tick hizası — gereksiz hareket yok. bir dahakine 50."
            } else if (lower.includes("nasıl") || lower.includes("how")) {
                reply = "yılan source yer. her yem bir node, run sonunda reasoning: ne yedim, nerede sıkıştım, sonraki rota."
            } else {
                reply = "noted. ekranı izliyorum — run başlat, ölünce reasoning'i buraya bırakırım."
            }
            await new Promise((r) => setTimeout(r, 350))
            setMsgs((m) => [...m, { role: "agent", text: reply, at: Date.now() }])
        } finally {
            setBusy(false)
        }
    }, [input, busy])

    return (
        <>
            <button type="button" className="agent-dock-toggle" onClick={toggle} aria-label="Toggle agent dock">
                {open ? "→" : "agent"}
            </button>
            {open ? (
                <aside className="agent-dock" aria-label="Agent chat dock">
                    <div className="agent-dock-head">
                        <span>agent dock</span>
                        <small>{runMeta ? `last run: ${runMeta.score} sources` : "idle"}</small>
                    </div>
                    {reasoning ? (
                        <div className="agent-dock-reasoning" aria-label="Run reasoning">
                            <div className="agent-dock-reasoning-head">run reasoning</div>
                            <p>{reasoning}</p>
                        </div>
                    ) : null}
                    <div className="agent-dock-feed" ref={feedRef}>
                        {msgs.length === 0 ? (
                            <p className="agent-dock-empty">
                                agent burada. run sonrası reasoning otomatik düşer — yazmak istersen yaz.
                            </p>
                        ) : (
                            msgs.map((m, i) => (
                                <div key={i} className={`agent-dock-msg is-${m.role}`}>
                                    {m.text}
                                </div>
                            ))
                        )}
                    </div>
                    <form
                        className="agent-dock-input"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void send()
                        }}
                    >
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="say something to the agent…"
                            aria-label="Message the agent"
                        />
                        <button type="submit" disabled={busy || !input.trim()}>
                            send
                        </button>
                    </form>
                </aside>
            ) : null}
        </>
    )
}
