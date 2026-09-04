"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import {
    AGENT_ACTIVITY_BROADCAST,
    AGENT_ACTIVITY_EVENT,
    formatActivityLine,
    formatActivityTime,
    type ActivityEvent,
} from "@/lib/agent-activity"

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

function useActivityFeed() {
    return useSyncExternalStore(subscribe, snapshot, () => [] as ActivityEvent[])
}

export function AgentActivityTicker() {
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
                        waiting for executeTool — {formatActivityLine({
                            id: "_",
                            ts: new Date().toISOString(),
                            actor: "agent",
                            action: "webmcp.tool",
                            tool: "geodesics_agent_login",
                            status: "ok",
                        })}
                    </li>
                )}
            </ul>
        </div>
    )
}
