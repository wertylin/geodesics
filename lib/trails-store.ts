import { redactEmails } from "@/lib/agent-activity"
import { assertPublicOrigin, formatTrailAge, isLoopbackOrigin, type Trail, type TrailStatus } from "@/lib/trails"
import { hasDatabase, sql } from "@/lib/db"

const TRAIL_CACHE_MS = 20_000
const TRAIL_GEN = 2
const QUERY_MS = 6000

const cacheG = globalThis as typeof globalThis & {
    __geodesicsTrailGen?: number
    __geodesicsTrailList?: { at: number; trails: Trail[] }
    __geodesicsTrailInflight?: Promise<Trail[]>
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

function withAge(trail: Trail): Trail {
    return { ...trail, age: formatTrailAge(trail.discovered_at) }
}

function rowToTrail(row: {
    id: string
    agent: string
    origin: string
    route: string
    status: string
    goal: string | null
    discovered_at: Date | string
}): Trail {
    const discovered =
        row.discovered_at instanceof Date
            ? row.discovered_at.toISOString()
            : new Date(row.discovered_at).toISOString()
    return withAge({
        id: row.id,
        agent: row.agent,
        origin: row.origin,
        route: row.route,
        status: (row.status as TrailStatus) || "observed",
        goal: row.goal ? redactEmails(row.goal) : undefined,
        discovered_at: discovered,
        age: "",
    })
}

export async function seedTrailsIfEmpty() {
    /* no fake rows — trails come from agents */
}

export async function purgeLoopbackTrails(): Promise<number> {
    if (!hasDatabase()) return 0
    const rows = await sql()`
        DELETE FROM trails
        WHERE origin ~* '(localhost|127\\.0\\.0\\.\\d+|\\[?::1\\]?|0\\.0\\.0\\.0)'
        RETURNING id
    `
    return rows.length
}

export function invalidateTrailListCache() {
    cacheG.__geodesicsTrailList = undefined
}

export async function listTrails(): Promise<Trail[]> {
    if (!hasDatabase()) return []
    if (cacheG.__geodesicsTrailGen !== TRAIL_GEN) {
        cacheG.__geodesicsTrailGen = TRAIL_GEN
        cacheG.__geodesicsTrailInflight = undefined
        cacheG.__geodesicsTrailList = undefined
    }
    const hit = cacheG.__geodesicsTrailList
    if (hit && Date.now() - hit.at < TRAIL_CACHE_MS) return hit.trails
    if (cacheG.__geodesicsTrailInflight) {
        return raceTimeout(cacheG.__geodesicsTrailInflight, QUERY_MS, "trails inflight timeout").catch(
            () => hit?.trails ?? []
        )
    }

    cacheG.__geodesicsTrailInflight = (async () => {
        const rows = await raceTimeout(
            Promise.resolve(
                sql()`
                    SELECT id, agent, origin, route, status, goal, discovered_at
                    FROM trails
                    ORDER BY discovered_at DESC
                    LIMIT 120
                `
            ),
            QUERY_MS,
            "trails list timeout"
        )
        const trails = rows.map(rowToTrail).filter((t) => !isLoopbackOrigin(t.origin))
        cacheG.__geodesicsTrailList = { at: Date.now(), trails }
        return trails
    })()
        .catch((err) => {
            console.error("[trails] listTrails failed", err)
            return hit?.trails ?? []
        })
        .finally(() => {
            cacheG.__geodesicsTrailInflight = undefined
        })
    return cacheG.__geodesicsTrailInflight
}

export async function getTrail(id: string): Promise<Trail | null> {
    if (!hasDatabase()) return null
    const rows = await sql()`
        SELECT id, agent, origin, route, status, goal, discovered_at
        FROM trails
        WHERE id = ${id}
        LIMIT 1
    `
    const row = rows[0]
    return row ? rowToTrail(row) : null
}

export async function leaveTrail(input: {
    agent: string
    origin: string
    route: string
    goal?: string
    status?: TrailStatus
    next?: string[]
}): Promise<Trail> {
    const origin = input.origin.trim()
    const route = input.route.trim()
    if (!origin) throw Object.assign(new Error("origin is required"), { status: 400 })
    if (!route) throw Object.assign(new Error("route is required"), { status: 400 })
    assertPublicOrigin(origin)
    if (!hasDatabase()) {
        throw Object.assign(new Error("POSTGRES_URL is not set — trails cannot persist"), { status: 503 })
    }

    const db = sql()
    const [{ max }] = await db`SELECT COALESCE(MAX(NULLIF(id, '')::int), 0) AS max FROM trails`
    const id = String(Number(max) + 1).padStart(3, "0")
    const discoveredAt = new Date().toISOString()
    const rows = await db`
        INSERT INTO trails (id, agent, origin, route, status, goal, discovered_at)
        VALUES (
            ${id},
            ${input.agent},
            ${origin},
            ${route},
            ${"observed"},
            ${redactEmails(input.goal?.trim() || "Leave a path for the next agent")},
            ${discoveredAt}
        )
        RETURNING id, agent, origin, route, status, goal, discovered_at
    `
    invalidateTrailListCache()
    return rowToTrail(rows[0])
}
