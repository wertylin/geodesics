"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import {
    AGENT_ACTIVITY_BROADCAST,
    AGENT_ACTIVITY_EVENT,
    formatActivityTime,
    type ActivityEvent,
} from "@/lib/agent-activity"
import {
    AGENT_SESSION_EVENT,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"

const MAX = 48
let mem: ActivityEvent[] = []
const listeners = new Set<() => void>()

function emit() {
    listeners.forEach((fn) => fn())
}

function push(ev: ActivityEvent) {
    if (!ev?.id) return
    const i = mem.findIndex((x) => x.id === ev.id)
    if (i >= 0) {
        mem = [ev, ...mem.slice(0, i), ...mem.slice(i + 1)]
    } else {
        mem = [ev, ...mem].slice(0, MAX)
    }
    emit()
}

function subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
        listeners.delete(fn)
    }
}

function snapshot() {
    return mem
}

const EMPTY: ActivityEvent[] = []

function useActivityFeed() {
    return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

type ChatMsg = {
    id: string
    sender: "human" | "agent"
    body: string
    created_at: string
}

function bondedPeer(session: VisitorAgentSession | null): string | null {
    if (!session) return null
    if (session.auth_type === "human_couple" && session.linked_agent) return session.linked_agent
    if (session.auth_type === "external_agent" && session.coupled_human) return session.identifier
    return null
}

function CoupleChat({ session }: { session: VisitorAgentSession }) {
    const peer =
        session.auth_type === "human_couple"
            ? session.linked_agent!
            : session.identifier
    const you = session.auth_type === "human_couple" ? "human" : "agent"
    const [messages, setMessages] = useState<ChatMsg[]>([])
    const [text, setText] = useState("")
    const [busy, setBusy] = useState(false)
    const [live, setLive] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const seen = useRef(new Set<string>())

    const ingest = (m: ChatMsg) => {
        if (!m?.id || seen.current.has(m.id)) return
        seen.current.add(m.id)
        setMessages((prev) => [...prev, m])
    }

    useEffect(() => {
        const ac = new AbortController()
        void fetch("/api/couple/chat?limit=80", { credentials: "include", signal: ac.signal, cache: "no-store" })
            .then((r) => r.json())
            .then((d: { messages?: ChatMsg[]; error?: string }) => {
                if (!Array.isArray(d.messages)) return
                for (const m of d.messages) ingest(m)
            })
            .catch(() => {})

        const es = new EventSource("/api/couple/chat?stream=1")
        es.onopen = () => setLive(true)
        es.onerror = () => setLive(false)
        es.onmessage = (msg) => {
            try {
                ingest(JSON.parse(msg.data) as ChatMsg)
            } catch {
                /* ignore */
            }
        }
        return () => {
            ac.abort()
            es.close()
        }
        // peer identity pins this channel
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peer])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" })
    }, [messages.length])

    const send = async (e: FormEvent) => {
        e.preventDefault()
        const body = text.trim()
        if (!body || busy) return
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/couple/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ body }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                message?: ChatMsg
            }
            if (!res.ok) throw new Error(data.error || "send failed")
            if (data.message) ingest(data.message)
            setText("")
        } catch (err) {
            setError(err instanceof Error ? err.message : "send failed")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="couple-chat" data-live={live ? "true" : "false"}>
            <div className="couple-chat-head">
                <span className="activity-pulse" aria-hidden />
                <span>CHAT · {peer}</span>
                <small>{live ? "live" : "idle"}</small>
            </div>
            <div className="couple-chat-log" role="log" aria-live="polite">
                {messages.length ? (
                    messages.map((m) => (
                        <div
                            key={m.id}
                            className="couple-chat-line"
                            data-from={m.sender}
                            data-you={m.sender === you ? "true" : "false"}
                        >
                            <span className="couple-chat-who">
                                {m.sender === you ? "you" : m.sender === "agent" ? peer : "human"}
                            </span>
                            <p>{m.body}</p>
                            <time dateTime={m.created_at}>
                                {formatActivityTime(m.created_at)}
                            </time>
                        </div>
                    ))
                ) : (
                    <p className="couple-chat-empty muted">
                        say hi to {peer} — they reply here via WebMCP (
                        <code>geodesics_couple_reply</code>)
                    </p>
                )}
                <div ref={bottomRef} />
            </div>
            <form className="couple-chat-compose" onSubmit={send}>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={you === "human" ? `message ${peer}…` : "reply to human…"}
                    maxLength={2000}
                    disabled={busy}
                    autoComplete="off"
                />
                <button type="submit" disabled={busy || !text.trim()}>
                    {busy ? "…" : "send"}
                </button>
            </form>
            {error ? <small className="couple-err">{error}</small> : null}
        </div>
    )
}

function ActivityLog() {
    const entries = useActivityFeed()
    const [live, setLive] = useState(false)
    const seeded = useRef(false)

    useEffect(() => {
        const onLocal = (e: Event) => {
            const detail = (e as CustomEvent<ActivityEvent>).detail
            if (detail) push(detail)
        }
        window.addEventListener(AGENT_ACTIVITY_EVENT, onLocal)

        let ch: BroadcastChannel | null = null
        try {
            ch = new BroadcastChannel(AGENT_ACTIVITY_BROADCAST)
            ch.onmessage = (msg) => {
                if (msg.data) push(msg.data as ActivityEvent)
            }
        } catch {
            /* ignore */
        }

        const ac = new AbortController()
        if (!seeded.current) {
            seeded.current = true
            void fetch("/api/agent/activity?limit=24", { signal: ac.signal })
                .then((r) => r.json())
                .then((d: { entries?: ActivityEvent[] }) => {
                    if (!Array.isArray(d.entries)) return
                    for (const ev of [...d.entries].reverse()) push(ev)
                })
                .catch(() => {})
        }

        const es = new EventSource("/api/agent/activity?stream=1")
        es.onopen = () => setLive(true)
        es.onerror = () => setLive(false)
        es.onmessage = (msg) => {
            try {
                push(JSON.parse(msg.data) as ActivityEvent)
            } catch {
                /* ignore */
            }
        }

        return () => {
            window.removeEventListener(AGENT_ACTIVITY_EVENT, onLocal)
            ch?.close()
            ac.abort()
            es.close()
        }
    }, [])

    const head = entries[0]

    return (
        <div className="activity-ticker" data-live={live ? "true" : "false"} aria-live="polite">
            <div className="activity-ticker-head">
                <span className="activity-pulse" aria-hidden />
                <span>AGENT ACTIVITY</span>
                <small>{live ? "live" : "idle"}</small>
            </div>
            <ul className="activity-ticker-list">
                {entries.length ? (
                    entries.slice(0, 12).map((ev) => (
                        <li key={ev.id} data-status={ev.status} className={ev === head ? "fresh" : undefined}>
                            <span className="activity-actor">{ev.actor}</span>
                            <span className="activity-sep">·</span>
                            <span className="activity-tool">{ev.tool ?? ev.action}</span>
                            <span className="activity-sep">→</span>
                            <span className="activity-status">{ev.status === "running" ? "…" : ev.status}</span>
                            <span className="activity-time">{formatActivityTime(ev.ts)}</span>
                            {ev.duration_ms != null && ev.status !== "running" ? (
                                <span className="activity-ms">{ev.duration_ms}ms</span>
                            ) : null}
                        </li>
                    ))
                ) : (
                    <li className="activity-empty muted">
                        waiting for executeTool — agent · geodesics_agent_login → ok · --:--:--
                    </li>
                )}
            </ul>
        </div>
    )
}

/** Middle dock: couple chat when bonded; otherwise activity feed. */
export function AgentActivityTicker() {
    const [session, setSession] = useState<VisitorAgentSession | null>(null)

    useEffect(() => {
        const sync = () => setSession(readVisitorAgentSession())
        sync()
        window.addEventListener(AGENT_SESSION_EVENT, sync)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, sync)
    }, [])

    const peer = bondedPeer(session)
    if (session && peer) {
        return <CoupleChat session={session} />
    }
    return <ActivityLog />
}
