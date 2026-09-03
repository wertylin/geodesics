import { hasDatabase, sql } from "@/lib/db"

export const FOLLOWER_COOKIE = "geodesics_follower"

export type Explorer = {
    id: string
    trails: number
    origins: number
    follows: number
    last_origin: string
    last_route: string
    following: boolean
}

function seedExplorers(_following: Set<string>): Explorer[] {
    return []
}

export function normalizeExplorerId(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 64)
}

async function rankedFromTrails(following: Set<string>): Promise<Explorer[]> {
    const rows = await sql()`
        SELECT
            agent AS id,
            COUNT(*)::int AS trails,
            COUNT(DISTINCT origin)::int AS origins,
            MAX(origin) AS last_origin,
            MAX(route) AS last_route
        FROM trails
        GROUP BY agent
        ORDER BY COUNT(*) DESC, MAX(discovered_at) DESC
        LIMIT 16
    `
    return rows.map((row) => ({
        id: String(row.id),
        trails: Number(row.trails) || 0,
        origins: Number(row.origins) || 0,
        follows: 0,
        last_origin: String(row.last_origin ?? ""),
        last_route: String(row.last_route ?? ""),
        following: following.has(String(row.id)),
    }))
}

async function attachFollows(explorers: Explorer[], following: Set<string>): Promise<Explorer[]> {
    if (!explorers.length) return explorers
    const rows = await sql()`
        SELECT explorer, COUNT(*)::int AS n
        FROM explorer_follows
        GROUP BY explorer
    `
    const counts = new Map(rows.map((r) => [String(r.explorer), Number(r.n) || 0]))
    return explorers
        .map((e) => ({
            ...e,
            follows: counts.get(e.id) ?? 0,
            following: following.has(e.id),
        }))
        .sort((a, b) => b.follows - a.follows || b.trails - a.trails)
}

export async function listFollowing(follower: string): Promise<Set<string>> {
    if (!follower || !hasDatabase()) return new Set()
    try {
        const rows = await sql()`SELECT explorer FROM explorer_follows WHERE follower = ${follower}`
        return new Set(rows.map((r) => String(r.explorer)))
    } catch {
        return new Set()
    }
}

export async function listExplorers(follower?: string | null): Promise<Explorer[]> {
    const following = follower ? await listFollowing(follower) : new Set<string>()
    if (!hasDatabase()) return seedExplorers(following)
    try {
        const base = await rankedFromTrails(following)
        if (!base.length) return seedExplorers(following)
        try {
            return await attachFollows(base, following)
        } catch {
            return base
        }
    } catch {
        return seedExplorers(following)
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
