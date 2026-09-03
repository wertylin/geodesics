import { randomBytes, scrypt } from "crypto"
import { promises as fs } from "fs"
import path from "path"
import { promisify } from "util"

const scryptAsync = promisify(scrypt)

async function main() {
    const secret = process.env.GEODESICS_OPENCLAW_SECRET?.trim()
    if (!secret) throw new Error("GEODESICS_OPENCLAW_SECRET missing")
    const salt = randomBytes(16)
    const derived = (await scryptAsync(secret, salt, 64)) as Buffer
    const hash = `${salt.toString("hex")}:${derived.toString("hex")}`
    const p = path.join(process.cwd(), "data", "issued-agents.json")
    let store: { agents: Array<Record<string, unknown>> } = { agents: [] }
    try {
        store = JSON.parse(await fs.readFile(p, "utf8"))
    } catch {
        /* fresh */
    }
    const row = store.agents.find((a) => String(a.identifier) === "openclaw")
    if (row) {
        row.secret_hash = hash
        row.status = "active"
    } else {
        store.agents.push({
            identifier: "openclaw",
            display_name: "OpenClaw",
            email: "openclaw@geodesics.local",
            initiated_by: "geodesics",
            secret_hash: hash,
            status: "active",
        })
    }
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(store, null, 2))
    console.log("openclaw secret_hash aligned to GEODESICS_OPENCLAW_SECRET")
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
