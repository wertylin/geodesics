import { ensureSchema, hasDatabase, sql } from "@/lib/db"
import { formatTrailAge, isLoopbackOrigin, type TrailStatus } from "@/lib/trails"
import { DEFAULT_SYSTEM_INITIATOR_EMAIL, networksForPrincipal, type NetworkMember } from "@/lib/trust-network"
import { TRUST_RINGS } from "@/lib/trust-rings"

export type WallNetwork = {
    id: string
    label: string
    kind: "human" | "system"
    owner_label: string | null
    member_count: number
}

export type WallPost = {
    id: string
    agent: string
    author: string
    author_kind: NetworkMember["kind"] | "unknown"
    origin: string
    route: string
    goal?: string
    status: TrailStatus
    age: string
    discovered_at: string
    networks: string[]
    you: boolean
}

export type NetworkWall = {
    networks: WallNetwork[]
    posts: WallPost[]
}

function builtinLabel(id: string): string {
    return TRUST_RINGS.find((r) => r.id === id)?.label ?? id
}

function iso(v: unknown): string {
    if (v instanceof Date) return v.toISOString()
    return new Date(String(v)).toISOString()
}

export async function listNetworkWall(opts: {
    principal: string
    linkedAgent?: string | null
}): Promise<NetworkWall> {
    const principal = opts.principal.trim().toLowerCase()
    const youSet = new Set(
        [principal, opts.linkedAgent?.trim().toLowerCase()].filter((x): x is string => Boolean(x))
    )
    if (!hasDatabase() || !principal) return { networks: [], posts: [] }

    try {
        await ensureSchema()
        const memberships = await networksForPrincipal(principal)
        if (!memberships.length) return { networks: [], posts: [] }

        const db = sql()
    const memberRows = await db`
        SELECT network, principal, kind
        FROM network_members
        WHERE network = ANY(${memberships})
    `
    const memberNets = new Map<string, string[]>()
    const memberKind = new Map<string, NetworkMember["kind"]>()
    const counts = new Map<string, number>()
    for (const row of memberRows) {
        const network = String(row.network)
        const p = String(row.principal)
        const kind = String(row.kind) as NetworkMember["kind"]
        const nets = memberNets.get(p) ?? []
        nets.push(network)
        memberNets.set(p, nets)
        if (!memberKind.has(p) || kind === "human") memberKind.set(p, kind)
        counts.set(network, (counts.get(network) ?? 0) + 1)
    }

    const principals = [...memberNets.keys()]

    const netRows = await db`
        SELECT n.id, n.label, n.kind, n.owner_principal, h.email, h.display_name
        FROM networks n
        LEFT JOIN humans h ON n.owner_principal = ('human:' || h.google_sub)
        WHERE n.id = ANY(${memberships})
    `
    const netById = new Map(
        netRows.map((row) => [
            String(row.id),
            {
                id: String(row.id),
                label: String(row.label),
                kind: (String(row.kind) === "system" ? "system" : "human") as WallNetwork["kind"],
                owner_label:
                    (typeof row.email === "string" && row.email) ||
                    (typeof row.display_name === "string" && row.display_name) ||
                    null,
            },
        ])
    )

    const networks: WallNetwork[] = memberships.map((id) => {
        const row = netById.get(id)
        if (row) {
            return { ...row, member_count: counts.get(id) ?? 0 }
        }
        return {
            id,
            label: builtinLabel(id),
            kind: "system",
            owner_label: DEFAULT_SYSTEM_INITIATOR_EMAIL,
            member_count: counts.get(id) ?? 0,
        }
    })

    if (!principals.length) return { networks, posts: [] }

    const trailRows = await db`
        SELECT
            t.id,
            t.agent,
            t.origin,
            t.route,
            t.status,
            t.goal,
            t.discovered_at,
            t.network AS tagged_network,
            h.email AS human_email,
            COALESCE(NULLIF(h.display_name, ''), NULLIF(a.display_name, '')) AS display_name
        FROM trails t
        LEFT JOIN humans h
            ON t.agent LIKE 'human:%' AND h.google_sub = substring(t.agent FROM 7)
        LEFT JOIN agents a ON a.identifier = t.agent
        WHERE t.agent = ANY(${principals})
           OR (t.network IS NOT NULL AND t.network = ANY(${memberships}))
        ORDER BY t.discovered_at DESC
        LIMIT 120
    `

    const posts: WallPost[] = []
    for (const row of trailRows) {
        const origin = String(row.origin ?? "")
        if (isLoopbackOrigin(origin)) continue
        const agent = String(row.agent)
        const tagged = String(row.tagged_network ?? "").trim().toLowerCase()
        const fromTag = tagged && memberships.includes(tagged) ? [tagged] : []
        const fromMember = (memberNets.get(agent) ?? []).filter((n) => memberships.includes(n))
        const nets = [...new Set(fromTag.length ? fromTag : fromMember)]
        if (!nets.length) continue
        const author =
            (typeof row.human_email === "string" && row.human_email) ||
            (typeof row.display_name === "string" && row.display_name) ||
            (agent.startsWith("human:") ? agent.slice(0, 14) + "…" : agent)
        const discovered = iso(row.discovered_at)
        posts.push({
            id: String(row.id),
            agent,
            author,
            author_kind: memberKind.get(agent) ?? (agent.startsWith("human:") ? "human" : "unknown"),
            origin,
            route: String(row.route ?? ""),
            goal: row.goal ? String(row.goal) : undefined,
            status: (String(row.status) as TrailStatus) || "observed",
            age: formatTrailAge(discovered),
            discovered_at: discovered,
            networks: nets,
            you: youSet.has(agent),
        })
    }

    return { networks, posts }
    } catch (err) {
        console.error("[network-wall] listNetworkWall failed", err)
        return { networks: [], posts: [] }
    }
}
