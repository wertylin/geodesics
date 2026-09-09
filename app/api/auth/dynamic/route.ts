import { NextRequest, NextResponse } from "next/server"
import { setVisitorCookie } from "@/lib/agent-access"
import { AGENT_EXPERIMENT_ID, newLedgerEntryId } from "@/lib/agent-ledger"
import { appendLedger } from "@/lib/agent-ledger-store"
import { dynamicAuthConfigured } from "@/lib/dynamic-config"
import { verifyDynamicJwt } from "@/lib/dynamic-jwt"
import {
    publicSession,
    sessionFromHuman,
    upsertHumanFromDynamic,
} from "@/lib/human-couple"

export const dynamic = "force-dynamic"

function raceMs<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
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

export async function POST(req: NextRequest) {
    if (!dynamicAuthConfigured()) {
        return NextResponse.json({ error: "Dynamic passport is not configured" }, { status: 503 })
    }

    const body = (await req.json().catch(() => ({}))) as { token?: unknown }
    const token = typeof body.token === "string" ? body.token : ""

    try {
        const identity = await verifyDynamicJwt(token)
        const now = new Date().toISOString()
        let human = {
            google_sub: `dyn:${identity.user_id}`,
            email: identity.email,
            display_name: identity.display_name,
            picture: null as string | null,
            linked_agent: null as string | null,
            couple_key_hash: null as string | null,
            created_at: now,
            last_login: now,
        }
        try {
            human = await raceMs(upsertHumanFromDynamic(identity), 10_000, "db_timeout")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "db_error"
            console.error("[dynamic] human upsert failed, using ephemeral session:", msg)
            if (!/localhost|127\.0\.0\.1/i.test(req.nextUrl.origin) && msg === "db_timeout") {
                return NextResponse.json({ error: "db_timeout" }, { status: 503 })
            }
        }

        const session = sessionFromHuman(human)
        void appendLedger({
            id: newLedgerEntryId(),
            ts: new Date().toISOString(),
            experiment: AGENT_EXPERIMENT_ID,
            actor: session.identifier,
            host_agent: "geodesics",
            action: "agent.login",
            ok: true,
            args: { auth_type: "human_couple", passport: "dynamic" },
            preview: "dynamic couple login",
        }).catch(() => {})

        const res = NextResponse.json({
            success: true,
            session: publicSession(session),
            path: "dynamic",
        })
        setVisitorCookie(res, session, req)
        return res
    } catch (err) {
        const msg = err instanceof Error ? err.message : "dynamic_failed"
        const status = (err as { status?: number }).status
        return NextResponse.json({ error: msg }, { status: typeof status === "number" ? status : 401 })
    }
}
