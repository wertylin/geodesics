import { NextRequest, NextResponse } from "next/server"
import { PUBLIC_AGENT_HEADERS } from "@/lib/agent-welcome"

export const dynamic = "force-dynamic"

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: PUBLIC_AGENT_HEADERS })
}

type RunSource = { i: number; c: number; r: number; t: number }

type RunPayload = {
    score?: number
    length?: number
    death?: "wall" | "self" | "unknown"
    sources?: RunSource[]
    cols?: number
    rows?: number
}

function buildPrompt(run: RunPayload): string {
    const sources = (run.sources ?? [])
        .slice(0, 30)
        .map((s) => `#${s.i} @ (${s.c},${s.r})`)
        .join(", ")
    const span =
        run.sources && run.sources.length >= 2
            ? Math.round(((run.sources[run.sources.length - 1].t - run.sources[0].t) / 1000) * 10) / 10
            : 0
    return [
        `You are the agent that just played a snake run on the geodesics landing page. The snake eats SOURCES (knowledge nodes), not pellets.`,
        `Run stats: score=${run.score ?? 0} sources eaten, body length=${run.length ?? "?"}, grid=${run.cols ?? "?"}x${run.rows ?? "?"}, death=${run.death ?? "unknown"}, run span=${span}s.`,
        `Eaten sources: ${sources || "none"}.`,
        `Write a 2-3 sentence run reasoning in the agent's voice: what the run was about (sources as a route on the grid), one tactical observation (e.g. corner trap, tail risk, tick pacing), and one line about the next run. Dark, precise, no emoji, lowercase vibe.`,
    ].join("\n")
}

async function reason(run: RunPayload): Promise<string> {
    const key = process.env.OPENAI_API_KEY
    if (!key) return "no LLM key set — run saved, reasoning offline."
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Terse, sharp agent voice. Max 60 words." },
                { role: "user", content: buildPrompt(run) },
            ],
            max_tokens: 140,
            temperature: 0.7,
        }),
    })
    if (!res.ok) return `LLM unavailable (${res.status}).`
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content?.trim() || "…"
}

export async function POST(req: NextRequest) {
    let body: RunPayload
    try {
        body = (await req.json()) as RunPayload
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: PUBLIC_AGENT_HEADERS })
    }
    const reasoning = await reason(body)
    return NextResponse.json({ ok: true, reasoning }, { headers: PUBLIC_AGENT_HEADERS })
}
