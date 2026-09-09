"use client"

import { useEffect } from "react"
import {
    isWebMcpBrowserApiAvailable,
    onEnsurePageTools,
    registerPageWebMcpTool,
    toWebMcpToolText,
} from "@/lib/webmcp-page-agent"
import {
    queueSnakeTurn,
    requestSnakePause,
    requestSnakeStart,
    snakeAgentView,
    snakeBest,
    noteScore,
    type SnakeDir,
} from "@/lib/snake-runtime"

const DIRS = new Set<SnakeDir>(["N", "E", "S", "W"])

function afterSnakeFrame(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

export function registerSnakeWebMcpTools() {
    registerPageWebMcpTool({
        name: "geodesics_get_page_state",
        description:
            "Landing snapshot: theme, snake running?, score, couple rail. Call before snake or chat actions.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
            const theme = document.documentElement.getAttribute("data-theme") || "organizma"
            const snake = snakeAgentView()
            const bondedRail = Boolean(document.querySelector(".couple-rail"))
            const onLanding = Boolean(document.querySelector(".landing-stage"))
            return toWebMcpToolText({
                surface: onLanding ? "landing" : "other",
                theme,
                bonded_rail: bondedRail,
                snake,
                hint: !snake.engine
                    ? "Navigate to / so the essay snake engine mounts, then geodesics_snake_start."
                    : snake.playing
                      ? "Poll geodesics_snake_state; steer with geodesics_snake_turn { dir: N|E|S|W }."
                      : "Call geodesics_snake_start, then turn toward food_delta.",
            })
        },
    })

    registerPageWebMcpTool({
        name: "geodesics_snake_state",
        description:
            "Snake vision for agents: head, dir, body[] (head first, for self-collision avoidance), length, food, food_delta {dc,dr}, grid, score, best. No screenshot.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => {
            const view = snakeAgentView()
            noteScore(view.score ?? 0)
            return toWebMcpToolText({ ...view, best: snakeBest() })
        },
    })

    registerPageWebMcpTool({
        name: "geodesics_snake_start",
        description: "Start or restart the landing text-snake (Space). Clears the center frame while playing.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            requestSnakeStart()
            await afterSnakeFrame()
            return toWebMcpToolText({ ok: true, ...snakeAgentView() })
        },
    })

    registerPageWebMcpTool({
        name: "geodesics_snake_pause",
        description: "Pause/resume snake. Omit paused to toggle; or pass paused: true|false.",
        inputSchema: {
            type: "object",
            properties: {
                paused: { type: "boolean", description: "Force pause state. Omit to toggle." },
            },
        },
        execute: async (input) => {
            const raw = (input as { paused?: unknown })?.paused
            const paused = typeof raw === "boolean" ? raw : undefined
            requestSnakePause(paused)
            await afterSnakeFrame()
            return toWebMcpToolText({ ok: true, ...snakeAgentView() })
        },
    })

    registerPageWebMcpTool({
        name: "geodesics_snake_turn",
        description:
            "Queue absolute direction N|E|S|W (same as WASD). Prefer infrequent turns — ticks ~9Hz. Toward food_delta.",
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
                return toWebMcpToolText({ ok: false, error: "dir must be N|E|S|W" })
            }
            const before = snakeAgentView()
            if (!before.engine) {
                return toWebMcpToolText({
                    ok: false,
                    error: "Snake engine not mounted — open / first.",
                    ...before,
                })
            }
            if (!before.playing) {
                return toWebMcpToolText({
                    ok: false,
                    error: "Not playing — call geodesics_snake_start first.",
                    ...before,
                })
            }
            queueSnakeTurn(dir)
            await afterSnakeFrame()
            return toWebMcpToolText({ ok: true, queued: dir, ...snakeAgentView() })
        },
    })
}

/** Registers landing snake tools (HMR + browser WebMCP retry), same pattern as IssuedAgentWebMcp. */
export function SnakeWebMcp() {
    useEffect(() => {
        const mount = () => registerSnakeWebMcpTools()
        mount()
        const offEnsure = onEnsurePageTools(mount)

        let tries = 0
        const retry = window.setInterval(() => {
            tries += 1
            if (isWebMcpBrowserApiAvailable() || tries >= 16) {
                if (isWebMcpBrowserApiAvailable()) mount()
                window.clearInterval(retry)
            }
        }, 250)

        return () => {
            window.clearInterval(retry)
            offEnsure()
        }
    }, [])

    return null
}
