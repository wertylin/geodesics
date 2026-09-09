"use client"

import { useEffect } from "react"
import { registerPageWebMcpTool } from "@/lib/webmcp-page-agent"
import {
    queueSnakeTurn,
    readSnakeSnapshot,
    requestSnakeStart,
    type SnakeDir,
} from "@/lib/snake-runtime"

function textResult(data: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
}

const DIRS = new Set<SnakeDir>(["N", "E", "S", "W"])

/** Registers landing snake / page inspect tools while the essay field is mounted. */
export function SnakeWebMcp() {
    useEffect(() => {
        registerPageWebMcpTool({
            name: "geodesics_get_page_state",
            description:
                "Landing page snapshot: theme, snake running?, score, couple rail presence. Use before acting.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: true },
            execute: async () => {
                const theme = document.documentElement.getAttribute("data-theme") || "organizma"
                const snake = readSnakeSnapshot()
                const bondedRail = Boolean(document.querySelector(".couple-rail"))
                return textResult({
                    surface: "landing",
                    theme,
                    bonded_rail: bondedRail,
                    snake,
                    hint: snake.playing
                        ? "Human may be playing. Use geodesics_snake_state / geodesics_snake_turn or chat via geodesics_couple_reply."
                        : "Call geodesics_snake_start to begin play, or talk via couple tools if bonded.",
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_snake_state",
            description:
                "Structured snake vision: head, dir, body length, food cell, grid size, score. No screenshot needed.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: true },
            execute: async () => textResult(readSnakeSnapshot()),
        })

        registerPageWebMcpTool({
            name: "geodesics_snake_start",
            description: "Start or restart the landing text-snake game (same as human pressing Space).",
            inputSchema: { type: "object", properties: {} },
            execute: async () => {
                requestSnakeStart()
                return textResult({ ok: true, ...readSnakeSnapshot() })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_snake_turn",
            description:
                "Queue snake direction. Same reducer as WASD. Prefer infrequent turns — game ticks ~9Hz.",
            inputSchema: {
                type: "object",
                properties: {
                    dir: {
                        type: "string",
                        enum: ["N", "E", "S", "W"],
                        description: "Absolute direction.",
                    },
                },
                required: ["dir"],
            },
            execute: async (input) => {
                const dir = String((input as { dir?: string })?.dir || "").toUpperCase() as SnakeDir
                if (!DIRS.has(dir)) {
                    return textResult({ ok: false, error: "dir must be N|E|S|W" })
                }
                queueSnakeTurn(dir)
                window.dispatchEvent(new Event("geodesics-snake-kick"))
                return textResult({ ok: true, queued: dir, ...readSnakeSnapshot() })
            },
        })
    }, [])

    return null
}
