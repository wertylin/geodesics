import { ensureSchema, hasDatabase, sql } from "@/lib/db"

export const SNAKE_PLAYER_COOKIE = "geodesics_snake_player"

export type SnakeScoreRow = {
    id: string
    player_id: string
    name: string
    score: number
    at: string
}

export type SnakeSubmitResult = {
    entry: SnakeScoreRow
    rank: number
    total: number
    personal_best: number
}

const MEM_LIMIT = 500

const cacheG = globalThis as typeof globalThis & {
    __geodesicsSnakeScores?: SnakeScoreRow[]
}

function memRows(): SnakeScoreRow[] {
    if (!cacheG.__geodesicsSnakeScores) cacheG.__geodesicsSnakeScores = []
    return cacheG.__geodesicsSnakeScores
}

function normalizeName(raw: string): string {
    const name = raw.trim().slice(0, 48)
    return name || "anon"
}

function normalizePlayerId(raw: string): string {
    return raw.trim().slice(0, 64) || "anon"
}

function rankOf(rows: SnakeScoreRow[], score: number, at: string): number {
    const ts = Date.parse(at)
    let rank = 1
    for (const row of rows) {
        if (row.score > score) rank += 1
        else if (row.score === score && Date.parse(row.at) < ts) rank += 1
    }
    return rank
}

function memSubmit(playerId: string, name: string, score: number): SnakeSubmitResult {
    const rows = memRows()
    const entry: SnakeScoreRow = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        player_id: playerId,
        name,
        score,
        at: new Date().toISOString(),
    }
    rows.push(entry)
    rows.sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at))
    if (rows.length > MEM_LIMIT) rows.splice(MEM_LIMIT)
    const personal_best = rows.filter((r) => r.player_id === playerId).reduce((m, r) => Math.max(m, r.score), 0)
    return {
        entry,
        rank: rankOf(rows, score, entry.at),
        total: rows.length,
        personal_best,
    }
}

function memList(limit: number): SnakeScoreRow[] {
    return memRows()
        .slice()
        .sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at))
        .slice(0, limit)
}

export async function listSnakeLeaderboard(limit = 10): Promise<SnakeScoreRow[]> {
    const cap = Math.min(Math.max(limit, 1), 25)
    if (!hasDatabase()) return memList(cap)
    try {
        await ensureSchema()
        const db = sql()
        const rows = await db`
            SELECT id::text, player_id, name, score, created_at AS at
            FROM snake_scores
            ORDER BY score DESC, created_at ASC
            LIMIT ${cap}
        `
        return rows.map((row) => ({
            id: String(row.id),
            player_id: String(row.player_id),
            name: String(row.name),
            score: Number(row.score) || 0,
            at: new Date(row.at as string | Date).toISOString(),
        }))
    } catch (err) {
        console.error("[snake-leaderboard] list failed", err)
        return memList(cap)
    }
}

export async function submitSnakeScore(
    playerId: string,
    name: string,
    score: number
): Promise<SnakeSubmitResult> {
    const pid = normalizePlayerId(playerId)
    const label = normalizeName(name)
    const pts = Math.max(0, Math.min(9999, Math.floor(score)))
    if (!hasDatabase()) return memSubmit(pid, label, pts)

    try {
        await ensureSchema()
        const db = sql()
        const inserted = await db`
            INSERT INTO snake_scores (player_id, name, score)
            VALUES (${pid}, ${label}, ${pts})
            RETURNING id::text, player_id, name, score, created_at AS at
        `
        const row = inserted[0]
        const entry: SnakeScoreRow = {
            id: String(row.id),
            player_id: String(row.player_id),
            name: String(row.name),
            score: Number(row.score) || 0,
            at: new Date(row.at as string | Date).toISOString(),
        }
        const [{ rank }] = await db`
            SELECT COUNT(*)::int + 1 AS rank
            FROM snake_scores
            WHERE score > ${pts}
               OR (score = ${pts} AND created_at < ${entry.at}::timestamptz)
        `
        const [{ total }] = await db`SELECT COUNT(*)::int AS total FROM snake_scores`
        const [{ best }] = await db`
            SELECT COALESCE(MAX(score), 0)::int AS best
            FROM snake_scores
            WHERE player_id = ${pid}
        `
        return {
            entry,
            rank: Number(rank) || 1,
            total: Number(total) || 1,
            personal_best: Number(best) || pts,
        }
    } catch (err) {
        console.error("[snake-leaderboard] submit failed", err)
        return memSubmit(pid, label, pts)
    }
}
