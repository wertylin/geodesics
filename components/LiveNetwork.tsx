"use client"

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react"
import { ExplorersBoard } from "@/components/ExplorersBoard"
import { GeodesicGlobe } from "@/components/GeodesicGlobe"
import type { Explorer } from "@/lib/explorers"
import type { Trail } from "@/lib/trails"

const LIVE_KEY = "geodesics_live_rail_v4"
const TTL_MS = 120_000

type LiveBundle = {
    trails: Trail[]
    explorers: Explorer[]
    at: number
    explorersReady: boolean
}

let mem: LiveBundle | null = null
let trailsInflight: Promise<void> | null = null
let explorersInflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
    listeners.forEach((fn) => fn())
}

function hydrate(): LiveBundle | null {
    if (mem) return mem
    try {
        const raw = sessionStorage.getItem(LIVE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as LiveBundle
        if (!Array.isArray(parsed.trails) || !Array.isArray(parsed.explorers)) return null
        mem = {
            ...parsed,
            explorersReady: parsed.explorersReady || parsed.explorers.length > 0,
        }
        return mem
    } catch {
        return null
    }
}

function persist(patch: Partial<LiveBundle>) {
    const prev = mem ?? { trails: [], explorers: [], at: 0, explorersReady: false }
    const explorers = patch.explorers?.length ? patch.explorers : prev.explorers
    mem = {
        trails: patch.trails ?? prev.trails,
        explorers,
        at: patch.at ?? Date.now(),
        explorersReady: patch.explorersReady ?? prev.explorersReady,
    }
    try {
        sessionStorage.setItem(LIVE_KEY, JSON.stringify(mem))
    } catch {
        /* ignore */
    }
    emit()
}

function loadTrails() {
    if (trailsInflight) return trailsInflight
    trailsInflight = fetch("/api/trails", { signal: AbortSignal.timeout(8000) })
        .then((r) => r.json())
        .then((d: { trails?: Trail[] }) => {
            persist({ trails: Array.isArray(d.trails) ? d.trails : [], at: Date.now() })
        })
        .catch(() => {
            persist({ trails: mem?.trails ?? [], at: Date.now() })
        })
        .finally(() => {
            trailsInflight = null
        })
    return trailsInflight
}

function loadExplorers() {
    if (explorersInflight) return explorersInflight
    explorersInflight = fetch("/api/explorers", { credentials: "include", signal: AbortSignal.timeout(8000) })
        .then((r) => r.json())
        .then((d: { explorers?: Explorer[] }) => {
            persist({
                explorers: Array.isArray(d.explorers) ? d.explorers.slice(0, 5) : [],
                explorersReady: true,
                at: Date.now(),
            })
        })
        .catch(() => {
            persist({ explorers: mem?.explorers ?? [], explorersReady: true, at: Date.now() })
        })
        .finally(() => {
            explorersInflight = null
        })
    return explorersInflight
}

function subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
        listeners.delete(fn)
    }
}

function snapshot(): LiveBundle | null {
    return mem
}

function useLive() {
    const snap = useSyncExternalStore(subscribe, snapshot, () => null)

    useEffect(() => {
        hydrate()
        emit()
        const hit = snapshot()
        const now = Date.now()
        const trailsFresh = Boolean(hit && now - hit.at < TTL_MS)
        const explorersFresh = Boolean(hit?.explorersReady && hit.explorers.length > 0 && now - hit.at < TTL_MS)
        if (!trailsFresh) void loadTrails()
        if (!explorersFresh) void loadExplorers()
    }, [])

    return {
        trails: snap?.trails ?? [],
        explorers: snap?.explorers ?? [],
        explorersReady: Boolean(snap?.explorersReady),
    }
}

function JuryRedeem() {
    const [open, setOpen] = useState(false)
    const [code, setCode] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async (e: FormEvent) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/jury/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ code }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                success?: boolean
                href?: string
                error?: string
            }
            if (!res.ok || !data.success || !data.href) {
                throw new Error(data.error || "Invalid desk code")
            }
            window.location.href = data.href
        } catch (err) {
            setError(err instanceof Error ? err.message : "Redeem failed")
            setBusy(false)
        }
    }

    if (!open) {
        return (
            <button type="button" className="trust-ring-enter" onClick={() => setOpen(true)}>
                jury desk code →
            </button>
        )
    }

    return (
        <form className="trust-ring-form" onSubmit={submit}>
            <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="DESK CODE"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
            />
            <button type="submit" disabled={busy || !code.trim()}>
                {busy ? "…" : "Join"}
            </button>
            {error ? <small className="trust-ring-error">{error}</small> : null}
        </form>
    )
}

export function LiveRail() {
    const { trails, explorers, explorersReady } = useLive()
    return (
        <aside id="explorers" className="hero-aside explorers-rail">
            <div className="explorers-rail-head">
                <span>TRUST NETWORK</span>
                <small>{String(trails.length).padStart(3, "0")} trails</small>
            </div>
            <span className="pulse-label">
                <i /> WebMCP entry live
            </span>
            {!explorersReady && !explorers.length ? (
                <p className="muted">ranking live traces…</p>
            ) : explorers.length ? (
                <ExplorersBoard initial={explorers} compact />
            ) : (
                <p className="muted">invite-only · join a trust network to appear</p>
            )}
            <JuryRedeem />
        </aside>
    )
}

export function LiveGlobe({ compact = false }: { compact?: boolean }) {
    const { trails } = useLive()
    return <GeodesicGlobe trails={trails} compact={compact} />
}
