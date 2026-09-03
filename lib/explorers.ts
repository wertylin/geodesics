import { hasDatabase, sql } from "@/lib/db"
import { seedTrustNetworkHosts } from "@/lib/trust-network"

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

type BoardRow = Omit<Explorer, "following">

const BOARD_TTL_MS = 30_000
const BOARD_GEN = 4
const QUERY_MS = 6000

const cacheG = globalThis as typeof globalThis & {
    __geodesicsExplorerGen?: number
    __geodesicsExplorerBoard?: { at: number; rows: BoardRow[] }
    __geodesicsExplorerInflight?: Promise<BoardRow[]>
    __geodesicsHostSeed?: Promise<void>
}

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(label)), ms)
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                reject(e)
            }
        )
    })
}

function seedOnce() {
    if (!cacheG.__geodesicsHostSeed) {
        cacheG.__geodesicsHostSeed = seedTrustNetworkHosts().catch((err) => {
            console.error("[explorers] seedTrustNetworkHosts failed", err)
        })
    }
    return cacheG.__geodesicsHostSeed
}

export function normalizeExplorerId(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 64)
}

export function invalidateExplorerBoardCache() {
    cacheG.__geodesicsExplorerBoard = undefined
}

async function loadBoard(): Promise<BoardRow[]> {
    if (cacheG.__geodesicsExplorerGen !== BOARD_GEN) {
        cacheG.__geodesicsExplorerGen = BOARD_GEN
        cacheG.__geodesicsExplorerInflight = undefined
        cacheG.__geodesicsExplorerBoard = undefined
    }
    const hit = cacheG.__geodesicsExplorerBoard
    if (hit && Date.now() - hit.at < BOARD_TTL_MS) return hit.rows
    if (cacheG.__geodesicsExplorerInflight) {
        return raceTimeout(cacheG.__geodesicsExplorerInflight, QUERY_MS, "explorers inflight timeout").catch(
            () => hit?.rows ?? []
        )
    }

    cacheG.__geodesicsExplorerInflight = (async () => {
        await seedOnce()
        const db = sql()
        const members = await raceTimeout(
            Promise.resolve(
                db`
                    SELECT principal, network
                    FROM network_members
                    WHERE kind IN ('agent', 'host')
                `
            ),
            QUERY_MS,
            "explorers members timeout"
        )

        const nets = new Map<string, string[]>()
        for (const row of members) {
            const id = String(row.principal).toLowerCase()
            const list = nets.get(id) ?? []
            list.push(String(row.network))
            nets.set(id, list)
        }
        const ids = [...nets.keys()]
        if (!ids.length) return []

        let rows: Array<{
            id: unknown
            trails: unknown
            origins: unknown
            last_origin: unknown
            last_route: unknown
        }> = []
        try {
            rows = await raceTimeout(
                Promise.resolve(
                    db`
                        SELECT
                            agent AS id,
                            COUNT(*)::int AS trails,
                            COUNT(DISTINCT origin)::int AS origins,
                            MAX(origin) AS last_origin,
                            MAX(route) AS last_route
                        FROM trails
                        WHERE LOWER(agent) IN ${db(ids)}
                        GROUP BY agent
                        ORDER BY COUNT(*) DESC, MAX(discovered_at) DESC
                        LIMIT 16
                    `
                ),
                QUERY_MS,
                "explorers trails timeout"
            )
        } catch (err) {
            console.error("[explorers] trail counts failed", err)
        }

        const byId = new Map(
            rows.map((row) => {
                const id = String(row.id)
                return [
                    id.toLowerCase(),
                    {
                        id,
                        trails: Number(row.trails) || 0,
                        origins: Number(row.origins) || 0,
                        follows: 0,
                        last_origin: String(row.last_origin ?? ""),
                        last_route: String(row.last_route ?? ""),
                        networks: nets.get(id.toLowerCase()) ?? [],
                    } satisfies BoardRow,
                ] as const
            })
        )
        const board: BoardRow[] = ids
            .map((id) => {
                return (
                    byId.get(id) ?? {
                        id,
                        trails: 0,
                        origins: 0,
                        follows: 0,
                        last_origin: "",
                        last_route: "",
                        networks: nets.get(id) ?? [],
                    }
                )
            })
            .sort((a, b) => b.trails - a.trails || a.id.localeCompare(b.id))
            .slice(0, 16)
        if (board.length) cacheG.__geodesicsExplorerBoard = { at: Date.now(), rows: board }
        return board
    })()
        .catch((err) => {
            console.error("[explorers] loadBoard failed", err)
            return hit?.rows ?? []
        })
        .finally(() => {
            cacheG.__geodesicsExplorerInflight = undefined
        })

    return cacheG.__geodesicsExplorerInflight
}

export async function listExplorers(follower?: string | null): Promise<Explorer[]> {
    if (!hasDatabase()) return []
    try {
        const board = await loadBoard()
        const following = new Set<string>()
        if (follower) {
            try {
                const f = await sql()`SELECT explorer FROM explorer_follows WHERE follower = ${follower}`
                for (const row of f) following.add(String(row.explorer))
            } catch {
                /* table may not exist yet */
            }
        }
        return board.map((row) => ({
            ...row,
            following: following.has(row.id),
        }))
    } catch (err) {
        console.error("[explorers] listExplorers failed", err)
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
