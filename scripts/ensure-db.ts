import { ensureSchema, hasDatabase, sql } from "../lib/db"
import { listTrails, seedTrailsIfEmpty } from "../lib/trails-store"
import { seedJury } from "../lib/jury"

async function main() {
    if (!hasDatabase()) {
        console.error("no POSTGRES_URL")
        process.exit(1)
    }
    await ensureSchema()
    await seedTrailsIfEmpty()
    await seedJury()
    const trails = await listTrails()
    console.log("trails", trails.length, trails.map((t) => t.id).join(","))
    const [{ n }] = await sql()`SELECT COUNT(*)::int AS n FROM jury`
    console.log("jury rows", n)
}

main().then(() => process.exit(0)).catch((err) => {
    console.error(err)
    process.exit(1)
})
