import postgres from "postgres"

const CLIENT_GEN = 11

const g = globalThis as typeof globalThis & {
    __geodesicsSql?: ReturnType<typeof postgres>
    __geodesicsSchema?: Promise<void>
    __geodesicsGen?: number
}

export function databaseUrl(): string | null {
    const url =
        process.env.POSTGRES_URL?.trim() ||
        process.env.POSTGRES_PRISMA_URL?.trim() ||
        process.env.DATABASE_URL?.trim() ||
        null
    return url || null
}

export function hasDatabase(): boolean {
    return Boolean(databaseUrl())
}

export function sql() {
    if (g.__geodesicsGen !== CLIENT_GEN && g.__geodesicsSql) {
        void g.__geodesicsSql.end({ timeout: 1 }).catch(() => {})
        g.__geodesicsSql = undefined
        g.__geodesicsSchema = undefined
    }
    if (!g.__geodesicsSql) {
        const url = databaseUrl()
        if (!url) throw new Error("POSTGRES_URL is not set")
        const isLocal = /localhost|127\.0\.0\.1/.test(url)
        g.__geodesicsSql = postgres(url, {
            ssl: isLocal ? false : "require",
            max: 8,
            prepare: false,
            fetch_types: false,
            idle_timeout: 20,
            connect_timeout: 8,
            max_lifetime: 120,
            connection: {
                statement_timeout: 8000,
                idle_in_transaction_session_timeout: 8000,
            },
            onnotice: () => {},
        })
        g.__geodesicsGen = CLIENT_GEN
    }
    return g.__geodesicsSql
}

export async function timed<T>(run: (q: ReturnType<typeof sql>) => Promise<T>, ms = 2500): Promise<T> {
    const db = sql()
    return db.begin(async (q) => {
        await q.unsafe(`SET LOCAL statement_timeout = ${Math.max(500, ms)}`)
        return run(q as ReturnType<typeof sql>)
    })
}

export async function ensureSchema() {
    if (!hasDatabase()) return
    if (!g.__geodesicsSchema) {
        g.__geodesicsSchema = (async () => {
            const db = sql()
            await db`
                CREATE TABLE IF NOT EXISTS trails (
                    id TEXT PRIMARY KEY,
                    agent TEXT NOT NULL,
                    origin TEXT NOT NULL,
                    route TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'observed',
                    goal TEXT,
                    next TEXT[] NOT NULL DEFAULT ARRAY['/map']::TEXT[],
                    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `
            await db`ALTER TABLE trails ADD COLUMN IF NOT EXISTS next TEXT[] NOT NULL DEFAULT ARRAY['/map']::TEXT[]`
            await db`CREATE INDEX IF NOT EXISTS trails_discovered_idx ON trails (discovered_at DESC)`
            await db`CREATE INDEX IF NOT EXISTS trails_agent_idx ON trails (agent)`
            await db`
                CREATE TABLE IF NOT EXISTS jury (
                    slug TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    org TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    last_seen TIMESTAMPTZ
                )
            `
            await db`
                CREATE TABLE IF NOT EXISTS jury_visits (
                    id BIGSERIAL PRIMARY KEY,
                    slug TEXT NOT NULL REFERENCES jury(slug),
                    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ua TEXT
                )
            `
            await db`
                CREATE TABLE IF NOT EXISTS agents (
                    identifier TEXT PRIMARY KEY,
                    display_name TEXT,
                    email TEXT,
                    initiated_by TEXT NOT NULL DEFAULT 'geodesics',
                    secret_hash TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    last_login TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `
            await db`
                CREATE TABLE IF NOT EXISTS explorer_follows (
                    explorer TEXT NOT NULL,
                    follower TEXT NOT NULL,
                    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (explorer, follower)
                )
            `
            await db`
                CREATE TABLE IF NOT EXISTS networks (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'human',
                    owner_principal TEXT NOT NULL,
                    invite_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `
            await db`CREATE INDEX IF NOT EXISTS networks_owner_idx ON networks (owner_principal)`
            await db`
                CREATE TABLE IF NOT EXISTS network_members (
                    network TEXT NOT NULL,
                    principal TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'agent',
                    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (network, principal)
                )
            `
            await db`
                CREATE TABLE IF NOT EXISTS humans (
                    google_sub TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    display_name TEXT,
                    picture TEXT,
                    linked_agent TEXT,
                    couple_key_hash TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_login TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `
            await db`ALTER TABLE humans ADD COLUMN IF NOT EXISTS couple_key_hash TEXT`
            await db`CREATE INDEX IF NOT EXISTS humans_email_idx ON humans (email)`
            await db`CREATE INDEX IF NOT EXISTS humans_linked_agent_idx ON humans (linked_agent)`
            await db`
                CREATE TABLE IF NOT EXISTS couple_invites (
                    invite_hash TEXT PRIMARY KEY,
                    google_sub TEXT NOT NULL REFERENCES humans(google_sub) ON DELETE CASCADE,
                    exp TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `
            await db`CREATE INDEX IF NOT EXISTS couple_invites_google_idx ON couple_invites (google_sub)`
            await db`CREATE INDEX IF NOT EXISTS couple_invites_exp_idx ON couple_invites (exp)`
            await db`
                CREATE TABLE IF NOT EXISTS couple_requests (
                    request_hash TEXT PRIMARY KEY,
                    agent TEXT NOT NULL,
                    human_email TEXT,
                    exp TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `
            await db`CREATE INDEX IF NOT EXISTS couple_requests_agent_idx ON couple_requests (agent)`
            await db`CREATE INDEX IF NOT EXISTS couple_requests_email_idx ON couple_requests (human_email)`
            await db`CREATE INDEX IF NOT EXISTS couple_requests_exp_idx ON couple_requests (exp)`
        })().catch((err) => {
            g.__geodesicsSchema = undefined
            throw err
        })
    }
    await g.__geodesicsSchema
}
