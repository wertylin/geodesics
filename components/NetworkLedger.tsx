"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { CoupleChat } from "@/components/AgentActivityTicker"
import {
    AGENT_SESSION_EVENT,
    readVisitorAgentSession,
    type VisitorAgentSession,
} from "@/lib/agent-session"
import { AGENT_ACTIVITY_EVENT, type ActivityEvent } from "@/lib/agent-activity"

type WallNetwork = {
    id: string
    label: string
    kind: "human" | "system"
    owner_label: string | null
    member_count: number
}

type WallPost = {
    id: string
    agent: string
    author: string
    author_kind: string
    origin: string
    route: string
    goal?: string
    status: string
    age: string
    discovered_at: string
    networks: string[]
    you: boolean
}

const ALL = "all"

function bondedPeer(session: VisitorAgentSession | null): string | null {
    if (!session) return null
    if (session.auth_type === "human_couple" && session.linked_agent) return session.linked_agent
    if (session.auth_type === "external_agent" && session.coupled_human) return session.identifier
    return null
}

function defaultOrigin(): string {
    if (typeof window === "undefined") return "https://geodesics.org"
    try {
        const u = new URL(window.location.origin)
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return "https://geodesics.org"
        return u.origin
    } catch {
        return "https://geodesics.org"
    }
}

function netCaption(n: WallNetwork): string {
    if (n.owner_label) return `${n.label} · ${n.owner_label}`
    return n.label
}

function WallPostCard({ post, labels }: { post: WallPost; labels: Map<string, WallNetwork> }) {
    const body = post.goal?.trim() || post.route
    const initial = (post.author[0] || "?").toUpperCase()
    return (
        <article className="wall-post" data-you={post.you ? "true" : "false"}>
            <div className="wall-post-avatar" aria-hidden>
                {initial}
            </div>
            <div className="wall-post-body">
                <header className="wall-post-meta">
                    <strong>{post.author}</strong>
                    <span className="wall-post-kind">{post.author_kind}</span>
                    {post.you ? <span className="wall-post-you">you</span> : null}
                    <time dateTime={post.discovered_at}>{post.age}</time>
                </header>
                <p>{body}</p>
                <div className="wall-post-trail">
                    <span>{post.origin}</span>
                    {post.route && post.goal ? <span>{post.route}</span> : null}
                </div>
                <footer>
                    {post.networks.map((id) => (
                        <span key={id} className="wall-chip">
                            {labels.get(id)?.label ?? id}
                        </span>
                    ))}
                    <a href={`/trail/${post.id}`}>#{post.id}</a>
                </footer>
            </div>
        </article>
    )
}

export function NetworkLedger() {
    const [session, setSession] = useState<VisitorAgentSession | null>(null)
    const [networks, setNetworks] = useState<WallNetwork[]>([])
    const [posts, setPosts] = useState<WallPost[]>([])
    const [tab, setTab] = useState(ALL)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [origin, setOrigin] = useState(defaultOrigin)
    const [route, setRoute] = useState("/")
    const [note, setNote] = useState("")
    const [chatOpen, setChatOpen] = useState(false)

    const load = useCallback(async (signal?: AbortSignal) => {
        const res = await fetch("/api/network/wall", {
            credentials: "include",
            cache: "no-store",
            signal,
        })
        const data = (await res.json().catch(() => ({}))) as {
            networks?: WallNetwork[]
            posts?: WallPost[]
            error?: string
        }
        if (!res.ok) throw new Error(data.error || "wall failed")
        setNetworks(Array.isArray(data.networks) ? data.networks : [])
        setPosts(Array.isArray(data.posts) ? data.posts : [])
        setError(null)
    }, [])

    useEffect(() => {
        const sync = () => setSession(readVisitorAgentSession())
        sync()
        window.addEventListener(AGENT_SESSION_EVENT, sync)
        return () => window.removeEventListener(AGENT_SESSION_EVENT, sync)
    }, [])

    useEffect(() => {
        const ac = new AbortController()
        setLoading(true)
        void load(ac.signal)
            .catch((err) => {
                if (!ac.signal.aborted) setError(err instanceof Error ? err.message : "wall failed")
            })
            .finally(() => {
                if (!ac.signal.aborted) setLoading(false)
            })

        const tick = window.setInterval(() => {
            void load().catch(() => {})
        }, 8000)

        const onActivity = (e: Event) => {
            const detail = (e as CustomEvent<ActivityEvent>).detail
            if (detail?.tool === "geodesics_leave_trail" || detail?.tool === "geodesics_join_network") {
                void load().catch(() => {})
            }
        }
        window.addEventListener(AGENT_ACTIVITY_EVENT, onActivity)

        return () => {
            ac.abort()
            window.clearInterval(tick)
            window.removeEventListener(AGENT_ACTIVITY_EVENT, onActivity)
        }
    }, [load, session?.identifier])

    const labels = useMemo(() => new Map(networks.map((n) => [n.id, n])), [networks])

    useEffect(() => {
        if (tab !== ALL && !networks.some((n) => n.id === tab)) setTab(ALL)
    }, [networks, tab])

    const visible = tab === ALL ? posts : posts.filter((p) => p.networks.includes(tab))
    const postNetwork = tab === ALL ? networks[0]?.id : tab
    const peer = bondedPeer(session)

    const submit = async (e: FormEvent) => {
        e.preventDefault()
        if (!note.trim() || busy || !postNetwork) return
        setBusy(true)
        setError(null)
        try {
            const nonceRes = await fetch("/api/write-nonce", { credentials: "include" })
            const nonceData = (await nonceRes.json().catch(() => ({}))) as {
                write_nonce?: string
                error?: string
            }
            if (!nonceRes.ok || !nonceData.write_nonce) {
                throw new Error(nonceData.error || "Join a trust network first")
            }
            const res = await fetch("/api/trails", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    origin: origin.trim(),
                    route: route.trim() || "/",
                    goal: note.trim(),
                    network: postNetwork,
                    write_nonce: nonceData.write_nonce,
                }),
            })
            const data = (await res.json().catch(() => ({}))) as { error?: string }
            if (!res.ok) throw new Error(data.error || "Could not leave trail")
            setNote("")
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : "post failed")
        } finally {
            setBusy(false)
        }
    }

    const headNet =
        tab === ALL
            ? networks.length
                ? `${networks.length} nets`
                : "no nets"
            : labels.get(tab)?.owner_label || labels.get(tab)?.id || tab

    return (
        <section className="network-ledger" aria-label="Trust network ledger">
            <div className="network-ledger-head">
                <span className="activity-pulse" aria-hidden />
                <span>NETWORK WALL</span>
                <small>{loading ? "…" : headNet}</small>
            </div>

            {networks.length ? (
                <div className="wall-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === ALL}
                        onClick={() => setTab(ALL)}
                    >
                        all
                    </button>
                    {networks.map((n) => (
                        <button
                            key={n.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === n.id}
                            title={netCaption(n)}
                            onClick={() => setTab(n.id)}
                        >
                            {n.label}
                            <em>{n.member_count}</em>
                        </button>
                    ))}
                </div>
            ) : null}

            {tab !== ALL && labels.get(tab)?.owner_label ? (
                <p className="wall-owner muted">
                    {labels.get(tab)!.label} · {labels.get(tab)!.owner_label}
                </p>
            ) : null}

            {networks.length ? (
                <form className="wall-compose" onSubmit={submit}>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={
                            postNetwork
                                ? `leave a trail on ${labels.get(postNetwork)?.label ?? postNetwork}…`
                                : "join a network to post"
                        }
                        maxLength={480}
                        rows={2}
                        disabled={busy || !postNetwork}
                    />
                    <div className="wall-compose-meta">
                        <input
                            value={origin}
                            onChange={(e) => setOrigin(e.target.value)}
                            placeholder="origin"
                            spellCheck={false}
                            disabled={busy}
                            aria-label="origin"
                        />
                        <input
                            value={route}
                            onChange={(e) => setRoute(e.target.value)}
                            placeholder="route"
                            spellCheck={false}
                            disabled={busy}
                            aria-label="route"
                        />
                        <button type="submit" disabled={busy || !note.trim() || !postNetwork}>
                            {busy ? "…" : "post"}
                        </button>
                    </div>
                </form>
            ) : null}

            <div className="wall-feed" role="feed">
                {loading && !posts.length ? (
                    <p className="muted">loading shared trails…</p>
                ) : !networks.length ? (
                    <p className="muted">
                        Join or start a trust network — this wall is the shared ledger for everyone on it.
                    </p>
                ) : visible.length ? (
                    visible.map((post) => <WallPostCard key={post.id} post={post} labels={labels} />)
                ) : (
                    <p className="muted">No trails on this wall yet. First post sets the geodesic.</p>
                )}
            </div>

            {error ? <small className="couple-err">{error}</small> : null}

            {session && peer ? (
                <div className="wall-chat" data-open={chatOpen ? "true" : "false"}>
                    <button type="button" className="wall-chat-toggle" onClick={() => setChatOpen((v) => !v)}>
                        chat · {peer}
                        <span>{chatOpen ? "↓" : "↑"}</span>
                    </button>
                    {chatOpen ? <CoupleChat session={session} /> : null}
                </div>
            ) : null}
        </section>
    )
}
