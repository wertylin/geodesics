import { ensureSchema, hasDatabase, sql } from "@/lib/db"

export type CoupleMessage = {
    id: string
    google_sub: string
    agent: string
    sender: "human" | "agent"
    body: string
    created_at: string
}

export type CouplePresence = {
    human: boolean
    agent: boolean
}

type MemMsg = CoupleMessage

const PRESENCE_TTL_MS = 45_000

const g = globalThis as typeof globalThis & {
    __geodesicsCoupleChat?: MemMsg[]
    __geodesicsCoupleChatSubs?: Set<(m: CoupleMessage) => void>
    __geodesicsCouplePresence?: Map<string, { human?: number; agent?: number }>
}

function mem(): MemMsg[] {
    if (!g.__geodesicsCoupleChat) g.__geodesicsCoupleChat = []
    return g.__geodesicsCoupleChat
}

function subs(): Set<(m: CoupleMessage) => void> {
    if (!g.__geodesicsCoupleChatSubs) g.__geodesicsCoupleChatSubs = new Set()
    return g.__geodesicsCoupleChatSubs
}

function presenceMap(): Map<string, { human?: number; agent?: number }> {
    if (!g.__geodesicsCouplePresence) g.__geodesicsCouplePresence = new Map()
    return g.__geodesicsCouplePresence
}

function pairKey(googleSub: string, agent: string): string {
    return `${googleSub.trim()}::${agent.trim().toLowerCase()}`
}

/** Mark a couple seat online (SSE open / heartbeat). */
export function touchCouplePresence(opts: {
    googleSub: string
    agent: string
    role: "human" | "agent"
}): CouplePresence {
    const key = pairKey(opts.googleSub, opts.agent)
    const row = presenceMap().get(key) ?? {}
    const now = Date.now()
    if (opts.role === "human") row.human = now
    else row.agent = now
    presenceMap().set(key, row)
    return readCouplePresence(opts.googleSub, opts.agent)
}

export function dropCouplePresence(opts: {
    googleSub: string
    agent: string
    role: "human" | "agent"
}): void {
    const key = pairKey(opts.googleSub, opts.agent)
    const row = presenceMap().get(key)
    if (!row) return
    if (opts.role === "human") delete row.human
    else delete row.agent
    if (!row.human && !row.agent) presenceMap().delete(key)
    else presenceMap().set(key, row)
}

export function readCouplePresence(googleSub: string, agent: string): CouplePresence {
    const row = presenceMap().get(pairKey(googleSub, agent))
    const now = Date.now()
    return {
        human: Boolean(row?.human && now - row.human < PRESENCE_TTL_MS),
        agent: Boolean(row?.agent && now - row.agent < PRESENCE_TTL_MS),
    }
}

export function subscribeCoupleChat(fn: (m: CoupleMessage) => void): () => void {
    subs().add(fn)
    return () => subs().delete(fn)
}

function emit(m: CoupleMessage) {
    for (const fn of subs()) {
        try {
            fn(m)
        } catch {
            /* ignore */
        }
    }
}

function mapRow(row: Record<string, unknown>): CoupleMessage {
    return {
        id: String(row.id),
        google_sub: String(row.google_sub),
        agent: String(row.agent),
        sender: String(row.sender) === "agent" ? "agent" : "human",
        body: String(row.body),
        created_at:
            row.created_at instanceof Date
                ? row.created_at.toISOString()
                : new Date(String(row.created_at)).toISOString(),
    }
}

async function ensureChatTable() {
    if (!hasDatabase()) return
    await ensureSchema()
    await sql()`
        CREATE TABLE IF NOT EXISTS couple_messages (
            id BIGSERIAL PRIMARY KEY,
            google_sub TEXT NOT NULL,
            agent TEXT NOT NULL,
            sender TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `
}

export async function listCoupleMessages(opts: {
    googleSub: string
    agent: string
    limit?: number
    afterId?: string | null
}): Promise<CoupleMessage[]> {
    const agent = opts.agent.trim().toLowerCase()
    const googleSub = opts.googleSub.trim()
    const limit = Math.min(Math.max(opts.limit ?? 80, 1), 200)

    if (!hasDatabase()) {
        return mem()
            .filter((m) => m.google_sub === googleSub && m.agent === agent)
            .filter((m) => (opts.afterId ? Number(m.id) > Number(opts.afterId) : true))
            .slice(-limit)
    }

    await ensureChatTable()
    if (opts.afterId) {
        const rows = await sql()`
            SELECT id, google_sub, agent, sender, body, created_at
            FROM couple_messages
            WHERE google_sub = ${googleSub}
              AND agent = ${agent}
              AND id > ${opts.afterId}
            ORDER BY id ASC
            LIMIT ${limit}
        `
        return rows.map((r) => mapRow(r as Record<string, unknown>))
    }
    const rows = await sql()`
        SELECT id, google_sub, agent, sender, body, created_at
        FROM couple_messages
        WHERE google_sub = ${googleSub} AND agent = ${agent}
        ORDER BY id DESC
        LIMIT ${limit}
    `
    return rows.map((r) => mapRow(r as Record<string, unknown>)).reverse()
}

export async function postCoupleMessage(opts: {
    googleSub: string
    agent: string
    sender: "human" | "agent"
    body: string
}): Promise<CoupleMessage> {
    const body = opts.body.trim().slice(0, 2000)
    if (!body) throw Object.assign(new Error("message required"), { status: 400 })
    const agent = opts.agent.trim().toLowerCase()
    const googleSub = opts.googleSub.trim()
    if (!agent || !googleSub) throw Object.assign(new Error("pair required"), { status: 400 })

    if (!hasDatabase()) {
        const msg: CoupleMessage = {
            id: String(Date.now()),
            google_sub: googleSub,
            agent,
            sender: opts.sender,
            body,
            created_at: new Date().toISOString(),
        }
        mem().push(msg)
        if (mem().length > 500) mem().splice(0, mem().length - 500)
        emit(msg)
        return msg
    }

    await ensureChatTable()
    const rows = await sql()`
        INSERT INTO couple_messages (google_sub, agent, sender, body)
        VALUES (${googleSub}, ${agent}, ${opts.sender}, ${body})
        RETURNING id, google_sub, agent, sender, body, created_at
    `
    const msg = mapRow(rows[0] as Record<string, unknown>)
    emit(msg)
    return msg
}
