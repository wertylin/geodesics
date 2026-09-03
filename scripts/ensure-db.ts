import { ensureSchema, hasDatabase, sql } from "../lib/db"
import { listTrails, seedTrailsIfEmpty } from "../lib/trails-store"
import { seedJury } from "../lib/jury"
import { seedTrustNetworkHosts, listNetworkMembers } from "../lib/trust-network"

async function main() {
    if (!hasDatabase()) {
        console.error("no POSTGRES_URL")
        process.exit(1)
    }
    await ensureSchema()
    await seedTrailsIfEmpty()
    await seedJury()
    await seedTrustNetworkHosts()
    const trails = await listTrails()
    console.log("trails", trails.length, trails.map((t) => t.id).join(","))
    const [{ n }] = await sql()`SELECT COUNT(*)::int AS n FROM jury`
    console.log("jury rows", n)
    const members = await listNetworkMembers()
    console.log(
        "network members",
        members.length,
        members.map((m) => `${m.network}:${m.principal}`).join(", ")
    )
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
