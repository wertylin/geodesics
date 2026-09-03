import { hasDatabase, sql, timed } from "@/lib/db"
import { networkedAgentIds, seedTrustNetworkHosts } from "@/lib/trust-network"

export const FOLLOWER_COOKIE = "geodesics_follower"

export type Explorer = {
    id: string
    trails: number
    origins: number
    follows: number
    last_origin: string
    last_route: string
    following: boolean
    networks: string[]
}

export function normalizeExplorerId(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 64)
}

export async function listExplorers(follower?: string | null): Promise<Explorer[]> {
    if (!hasDatabase()) return []
    try {
        await seedTrustNetworkHosts().catch(() => {})
        const networked = await networkedAgentIds()
        if (!networked.size) return []

        return await timed(async (q) => {
            const rows = await q`
                SELECT
                    agent AS id,
                    COUNT(*)::int AS trails,
                    COUNT(DISTINCT origin)::int AS origins,
                    MAX(origin) AS last_origin,
                    MAX(route) AS last_route
                FROM trails
                GROUP BY agent
                ORDER BY COUNT(*) DESC, MAX(discovered_at) DESC
                LIMIT 32
            `
            const following = new Set<string>()
            if (follower) {
                try {
                    const f = await q`SELECT explorer FROM explorer_follows WHERE follower = ${follower}`
                    for (const row of f) following.add(String(row.explorer))
                } catch {
                    /* table may not exist yet */
                }
            }

            const memberNets = await (async () => {
                try {
                    return await q`SELECT principal, network FROM network_members WHERE kind IN ('agent', 'host')`
                } catch {
                    return [] as Array<{ principal: string; network: string }>
                }
            })()

            const byPrincipal = new Map<string, string[]>()
            for (const row of memberNets) {
                const id = String(row.principal).toLowerCase()
                const list = byPrincipal.get(id) ?? []
                list.push(String(row.network))
                byPrincipal.set(id, list)
            }

            return rows
                .filter((row) => networked.has(String(row.id).toLowerCase()))
                .slice(0, 16)
                .map((row) => {
                    const id = String(row.id)
                    return {
                        id,
                        trails: Number(row.trails) || 0,
                        origins: Number(row.origins) || 0,
                        follows: 0,
                        last_origin: String(row.last_origin ?? ""),
                        last_route: String(row.last_route ?? ""),
                        following: following.has(id),
                        networks: byPrincipal.get(id.toLowerCase()) ?? [],
                    }
                })
        }, 2500)
    } catch {
        return []
    }
}

export async function toggleFollow(
    explorer: string,
    follower: string
): Promise<{ following: boolean; follows: number }> {
    const id = normalizeExplorerId(explorer)
    if (id.length < 2) throw Object.assign(new Error("explorer is required"), { status: 400 })
    if (!hasDatabase()) throw Object.assign(new Error("database unavailable"), { status: 503 })

    const db = sql()
    await db`
        CREATE TABLE IF NOT EXISTS explorer_follows (
            explorer TEXT NOT NULL,
            follower TEXT NOT NULL,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (explorer, follower)
        )
    `
    const existing = await db`
        SELECT 1 FROM explorer_follows WHERE explorer = ${id} AND follower = ${follower} LIMIT 1
    `
    if (existing.length) {
        await db`DELETE FROM explorer_follows WHERE explorer = ${id} AND follower = ${follower}`
    } else {
        await db`INSERT INTO explorer_follows (explorer, follower) VALUES (${id}, ${follower})`
    }
    const [{ n }] = await db`SELECT COUNT(*)::int AS n FROM explorer_follows WHERE explorer = ${id}`
    return { following: existing.length === 0, follows: Number(n) || 0 }
}
