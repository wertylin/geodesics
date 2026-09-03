import { formatTrailAge, type Trail, type TrailStatus } from "@/lib/trails"
import { hasDatabase, sql, timed } from "@/lib/db"

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
        goal: row.goal ?? undefined,
        discovered_at: discovered,
        age: "",
    })
}

export async function seedTrailsIfEmpty() {
    /* no fake rows — trails come from agents */
}

export async function listTrails(): Promise<Trail[]> {
    if (!hasDatabase()) return []
    try {
        const rows = await timed(
            (q) => q`
                SELECT id, agent, origin, route, status, goal, discovered_at
                FROM trails
                ORDER BY discovered_at DESC
            `,
            2500
        )
        return rows.map(rowToTrail)
    } catch {
        return []
    }
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
            ${input.status ?? "observed"},
            ${input.goal?.trim() || "Leave a path for the next agent"},
            ${discoveredAt}
        )
        RETURNING id, agent, origin, route, status, goal, discovered_at
    `
    return rowToTrail(rows[0])
}
