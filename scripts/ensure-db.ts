import { ensureSchema, hasDatabase, sql } from "../lib/db"
import { listTrails, purgeLoopbackTrails, seedTrailsIfEmpty } from "../lib/trails-store"
import { seedJury } from "../lib/jury"
import { seedTrustNetworkHosts, listNetworkMembers } from "../lib/trust-network"

async function main() {
    if (!hasDatabase()) {
        console.error("no POSTGRES_URL")
        process.exit(1)
    }
    await ensureSchema()
    const purged = await purgeLoopbackTrails()
    console.log("purged loopback trails", purged)
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
    const owned = await sql()`SELECT id, kind, left(owner_principal, 18) AS owner FROM networks ORDER BY id`
    console.log("networks", owned)
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
