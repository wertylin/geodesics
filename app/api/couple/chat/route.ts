import { NextRequest, NextResponse } from "next/server"
import { agentCorsHeaders, agentOptionsResponse, requireVisitor } from "@/lib/agent-access"
import {
    listCoupleMessages,
    postCoupleMessage,
    subscribeCoupleChat,
    type CoupleMessage,
} from "@/lib/couple-chat"
import { getHumanByGoogleSub, getHumanByLinkedAgent } from "@/lib/human-couple"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

async function resolvePair(visitor: {
    auth_type?: string | null
    google_sub?: string | null
    identifier: string
    linked_agent?: string | null
}): Promise<{ googleSub: string; agent: string; sender: "human" | "agent" } | { error: string; status: number }> {
    if (visitor.auth_type === "human_couple" && visitor.google_sub) {
        const human = await getHumanByGoogleSub(visitor.google_sub)
        const agent = (human?.linked_agent || visitor.linked_agent || "").trim().toLowerCase()
        if (!agent) {
            return { error: "Link an agent first — then you can chat here.", status: 403 }
        }
        return { googleSub: visitor.google_sub, agent, sender: "human" }
    }
    if (visitor.auth_type === "external_agent") {
        const human = await getHumanByLinkedAgent(visitor.identifier)
        if (!human) {
            return {
                error: "No coupled human. Human must accept your couple request (or mint invite) first.",
                status: 403,
            }
        }
        return { googleSub: human.google_sub, agent: visitor.identifier.trim().toLowerCase(), sender: "agent" }
    }
    return { error: "Sign in as human couple or linked agent.", status: 401 }
}

export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    const pair = await resolvePair(gate.visitor)
    if ("error" in pair) {
        return NextResponse.json({ error: pair.error }, { status: pair.status, headers: cors })
    }

    const wantStream =
        req.nextUrl.searchParams.get("stream") === "1" ||
        (req.headers.get("accept") ?? "").includes("text/event-stream")

    if (!wantStream) {
        const afterId = req.nextUrl.searchParams.get("after")
        const messages = await listCoupleMessages({
            googleSub: pair.googleSub,
            agent: pair.agent,
            afterId,
            limit: Number(req.nextUrl.searchParams.get("limit") ?? "80") || 80,
        })
        return NextResponse.json(
            {
                success: true,
                pair: { agent: pair.agent, google_sub: pair.googleSub },
                you: pair.sender,
                messages,
            },
            { headers: { ...cors, "Cache-Control": "no-store" } }
        )
    }

    const encoder = new TextEncoder()
    let closed = false
    let unsub: (() => void) | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const push = (line: string) => {
                if (closed) return
                try {
                    controller.enqueue(encoder.encode(line))
                } catch {
                    closed = true
                }
            }
            const send = (m: CoupleMessage) => {
                if (m.google_sub !== pair.googleSub || m.agent !== pair.agent) return
                push(`data: ${JSON.stringify(m)}\n\n`)
            }

            push(
                `event: hello\ndata: ${JSON.stringify({
                    ok: true,
                    pair: { agent: pair.agent },
                    you: pair.sender,
                })}\n\n`
            )

            const recent = await listCoupleMessages({
                googleSub: pair.googleSub,
                agent: pair.agent,
                limit: 60,
            })
            for (const m of recent) send(m)

            unsub = subscribeCoupleChat(send)
            heartbeat = setInterval(() => push(`: ping\n\n`), 15_000)
        },
        cancel() {
            closed = true
            unsub?.()
            if (heartbeat) clearInterval(heartbeat)
        },
    })

    return new NextResponse(stream, {
        headers: {
            ...cors,
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store, no-transform",
            Connection: "keep-alive",
        },
    })
}

export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    const pair = await resolvePair(gate.visitor)
    if ("error" in pair) {
        return NextResponse.json({ error: pair.error }, { status: pair.status, headers: cors })
    }

    let body: { body?: string; message?: string }
    try {
        body = (await req.json()) as { body?: string; message?: string }
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const text = typeof body.body === "string" ? body.body : typeof body.message === "string" ? body.message : ""
    try {
        const message = await postCoupleMessage({
            googleSub: pair.googleSub,
            agent: pair.agent,
            sender: pair.sender,
            body: text,
        })
        return NextResponse.json(
            { success: true, message, you: pair.sender, pair: { agent: pair.agent } },
            { headers: cors }
        )
    } catch (err) {
        const status =
            typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 500
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "send failed" },
            { status: Number.isFinite(status) ? status : 500, headers: cors }
        )
    }
}
