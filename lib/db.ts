import postgres from "postgres"

const CLIENT_GEN = 4

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
            max: 3,
            prepare: false,
            fetch_types: false,
            idle_timeout: 20,
            connect_timeout: 4,
            max_lifetime: 60 * 2,
            connection: { statement_timeout: 4000 },
            onnotice: () => {},
        })
        g.__geodesicsGen = CLIENT_GEN
    }
    return g.__geodesicsSql
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
        })().catch((err) => {
            g.__geodesicsSchema = undefined
            throw err
        })
    }
    await g.__geodesicsSchema
}
