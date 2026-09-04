"use client"

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react"
import { ExplorersBoard } from "@/components/ExplorersBoard"
import { GeodesicGlobe } from "@/components/GeodesicGlobe"
import type { Explorer } from "@/lib/explorers"
import type { Trail } from "@/lib/trails"
import { AGENT_SESSION_EVENT, readVisitorAgentSession } from "@/lib/agent-session"

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

function HumanStartNetwork() {
    const [session, setSession] = useState(() =>
        typeof window === "undefined" ? null : readVisitorAgentSession()
    )
    const [open, setOpen] = useState(false)
    const [label, setLabel] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [created, setCreated] = useState<{ id: string; invite: string; label: string } | null>(null)

    useEffect(() => {
        const sync = () => setSession(readVisitorAgentSession())
        sync()
        window.addEventListener(AGENT_SESSION_EVENT, sync)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, sync)
    }, [])

    if (!session || session.auth_type !== "human_couple") return null

    const submit = async (e: FormEvent) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
            const res = await fetch("/api/network/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ label: label.trim() || undefined }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                success?: boolean
                error?: string
                invite?: string
                network?: { id?: string; label?: string }
                memberships?: string[]
            }
            if (!res.ok || !data.success || !data.invite || !data.network?.id) {
                throw new Error(data.error || "Could not start network")
            }
            setCreated({
                id: data.network.id,
                invite: data.invite,
                label: data.network.label || "human trust network",
            })
            setOpen(false)
            window.dispatchEvent(new Event(AGENT_SESSION_EVENT))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Create failed")
        } finally {
            setBusy(false)
        }
    }

    if (created) {
        return (
            <div className="trust-human-created">
                <span>network live · {created.id}</span>
                <code title="copy invite — shown once">{created.invite}</code>
                <small>share id + invite with agents · linked agent auto-joined</small>
                <button
                    type="button"
                    className="trust-ring-enter"
                    onClick={() => {
                        setCreated(null)
                        setLabel("")
                    }}
                >
                    start another →
                </button>
            </div>
        )
    }

    if (!open) {
        return (
            <button type="button" className="trust-ring-enter" onClick={() => setOpen(true)}>
                start human network →
            </button>
        )
    }

    return (
        <form className="trust-ring-form" onSubmit={submit}>
            <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="LABEL (optional)"
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                maxLength={80}
            />
            <button type="submit" disabled={busy}>
                {busy ? "…" : "Start"}
            </button>
            {error ? <small className="trust-ring-error">{error}</small> : null}
        </form>
    )
}

function NetworkAdminDesk() {
    const [session, setSession] = useState(() =>
        typeof window === "undefined" ? null : readVisitorAgentSession()
    )
    type OwnedNet = {
        id: string
        label: string
        kind: "system" | "human"
        member_count: number
        members: Array<{ principal: string; kind: string; joined_at: string }>
    }
    const [owned, setOwned] = useState<OwnedNet[]>([])
    const [openId, setOpenId] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [inviteFlash, setInviteFlash] = useState<{ id: string; invite: string } | null>(null)

    const load = async () => {
        if (!session || session.auth_type !== "human_couple") {
            setOwned([])
            return
        }
        try {
            const res = await fetch("/api/network/manage", {
                credentials: "include",
                signal: AbortSignal.timeout(8000),
            })
            const data = (await res.json().catch(() => ({}))) as {
                networks?: OwnedNet[]
                error?: string
            }
            if (!res.ok) {
                setOwned([])
                return
            }
            setOwned(Array.isArray(data.networks) ? data.networks : [])
        } catch {
            /* ignore */
        }
    }

    useEffect(() => {
        const sync = () => setSession(readVisitorAgentSession())
        sync()
        window.addEventListener(AGENT_SESSION_EVENT, sync)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, sync)
    }, [])

    useEffect(() => {
        void load()
    }, [session?.identifier, session?.auth_type])

    if (!session || session.auth_type !== "human_couple" || !owned.length) return null

    const kick = async (network: string, principal: string) => {
        setBusy(`${network}:${principal}`)
        setError(null)
        try {
            const res = await fetch("/api/network/manage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "kick", network, principal }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                members?: OwnedNet["members"]
            }
            if (!res.ok) throw new Error(data.error || "kick failed")
            setOwned((prev) =>
                prev.map((n) =>
                    n.id === network
                        ? {
                              ...n,
                              members: Array.isArray(data.members) ? data.members : n.members,
                              member_count: Array.isArray(data.members)
                                  ? data.members.length
                                  : Math.max(0, n.member_count - 1),
                          }
                        : n
                )
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : "kick failed")
        } finally {
            setBusy(null)
        }
    }

    const rotate = async (network: string) => {
        setBusy(`rotate:${network}`)
        setError(null)
        setInviteFlash(null)
        try {
            const res = await fetch("/api/network/manage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "rotate_invite", network }),
            })
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                invite?: string
            }
            if (!res.ok || !data.invite) throw new Error(data.error || "rotate failed")
            setInviteFlash({ id: network, invite: data.invite })
        } catch (err) {
            setError(err instanceof Error ? err.message : "rotate failed")
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="trust-admin">
            <div className="trust-admin-head">
                <span>initiator desk</span>
                <small>{String(owned.length).padStart(2, "0")} owned</small>
            </div>
            <ul className="trust-admin-list">
                {owned.map((n) => {
                    const open = openId === n.id
                    return (
                        <li key={n.id} data-open={open ? "true" : "false"}>
                            <button
                                type="button"
                                className="trust-admin-net"
                                onClick={() => setOpenId(open ? null : n.id)}
                            >
                                <strong>{n.label}</strong>
                                <span>
                                    {n.id}
                                    {" · "}
                                    {n.kind}
                                    {" · "}
                                    {String(n.member_count).padStart(2, "0")} members
                                </span>
                                <em aria-hidden>{open ? "−" : "+"}</em>
                            </button>
                            {open ? (
                                <div className="trust-admin-body">
                                    <ol>
                                        {n.members.map((m) => (
                                            <li key={m.principal}>
                                                <code title={m.principal}>
                                                    {m.principal.length > 28
                                                        ? `${m.principal.slice(0, 20)}…`
                                                        : m.principal}
                                                </code>
                                                <small>{m.kind}</small>
                                                {m.principal === session.identifier ? (
                                                    <span className="trust-admin-you">you</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="trust-admin-kick"
                                                        disabled={busy === `${n.id}:${m.principal}`}
                                                        onClick={() => void kick(n.id, m.principal)}
                                                    >
                                                        kick
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ol>
                                    {n.kind === "human" ? (
                                        <button
                                            type="button"
                                            className="trust-ring-enter"
                                            disabled={busy === `rotate:${n.id}`}
                                            onClick={() => void rotate(n.id)}
                                        >
                                            rotate invite →
                                        </button>
                                    ) : (
                                        <small className="muted">
                                            system ring · join via env invite / desk code
                                        </small>
                                    )}
                                    {inviteFlash?.id === n.id ? (
                                        <code className="trust-admin-invite" title="shown once">
                                            {inviteFlash.invite}
                                        </code>
                                    ) : null}
                                </div>
                            ) : null}
                        </li>
                    )
                })}
            </ul>
            {error ? <small className="trust-ring-error">{error}</small> : null}
        </div>
    )
}

/** Glass dock panel — trust network explorers + desk redeem. */
export function TrustNetworkPanel() {
    const { trails, explorers, explorersReady } = useLive()
    return (
        <aside id="explorers" className="trust-panel" aria-label="Trust network">
            <div className="trust-panel-head">
                <span className="activity-pulse" aria-hidden />
                <span>TRUST NETWORK</span>
                <small>{String(trails.length).padStart(3, "0")} trails</small>
            </div>
            <NetworkAdminDesk />
            <div className="trust-panel-body">
                {!explorersReady && !explorers.length ? (
                    <p className="muted">ranking live traces…</p>
                ) : explorers.length ? (
                    <ExplorersBoard initial={explorers} compact dock />
                ) : (
                    <p className="muted">invite-only · join to appear</p>
                )}
            </div>
            <div className="trust-panel-actions">
                <HumanStartNetwork />
                <JuryRedeem />
            </div>
        </aside>
    )
}

/** @deprecated use TrustNetworkPanel in AgentLiveChrome */
export function LiveRail() {
    return <TrustNetworkPanel />
}

export function LiveGlobe({ compact = false }: { compact?: boolean }) {
    const { trails } = useLive()
    const [alive, setAlive] = useState(false)

    useEffect(() => {
        const ACTIVITY_TTL_MS = 5 * 60_000
        let lastAgentHit = 0
        let peer: string | null = null
        let cancelled = false
        let timer: ReturnType<typeof setInterval> | null = null
        let es: EventSource | null = null

        const refreshPeer = () => {
            const s = readVisitorAgentSession()
            if (s?.auth_type === "human_couple" && s.linked_agent) {
                peer = s.linked_agent.trim().toLowerCase()
            } else if (s?.auth_type === "external_agent" && s.coupled_human) {
                // agent side: "alive" when bonded (you're the live agent)
                peer = s.identifier.trim().toLowerCase()
                setAlive(true)
                return peer
            } else {
                peer = null
                setAlive(false)
            }
            return peer
        }

        const tickPresence = async () => {
            const id = refreshPeer()
            if (!id || cancelled) return
            const s = readVisitorAgentSession()
            // Only humans need to probe for agent online; agents are themselves alive when bonded.
            if (s?.auth_type === "external_agent") return
            try {
                const res = await fetch("/api/couple/chat?limit=1", {
                    credentials: "include",
                    cache: "no-store",
                    signal: AbortSignal.timeout(6000),
                })
                const data = (await res.json().catch(() => ({}))) as {
                    presence?: { agent?: boolean }
                }
                if (cancelled) return
                if (data.presence?.agent) {
                    lastAgentHit = Date.now()
                    setAlive(true)
                    return
                }
            } catch {
                /* ignore */
            }
            setAlive(Date.now() - lastAgentHit < ACTIVITY_TTL_MS)
        }

        refreshPeer()
        void tickPresence()
        timer = setInterval(() => void tickPresence(), 12_000)

        const onSession = () => {
            refreshPeer()
            void tickPresence()
        }
        window.addEventListener(AGENT_SESSION_EVENT, onSession)

        try {
            es = new EventSource("/api/agent/activity?stream=1")
            es.addEventListener("hello", () => {
                /* seed handled via onmessage backlog */
            })
            es.onmessage = (msg) => {
                const id = peer || refreshPeer()
                if (!id || cancelled) return
                try {
                    const ev = JSON.parse(msg.data) as { actor?: string; ts?: string }
                    if ((ev.actor || "").toLowerCase() !== id) return
                    const hit = ev.ts ? Date.parse(ev.ts) || Date.now() : Date.now()
                    if (Date.now() - hit > ACTIVITY_TTL_MS) return
                    lastAgentHit = hit
                    setAlive(true)
                } catch {
                    /* ignore */
                }
            }
        } catch {
            /* ignore */
        }

        return () => {
            cancelled = true
            if (timer) clearInterval(timer)
            window.removeEventListener(AGENT_SESSION_EVENT, onSession)
            es?.close()
        }
    }, [])

    return <GeodesicGlobe trails={trails} compact={compact} alive={alive} />
}
