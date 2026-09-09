export type SnakeDir = "N" | "E" | "S" | "W"

export type SnakeSnapshot = {
    playing: boolean
    paused: boolean
    dead: boolean
    score: number
    dir: SnakeDir
    head: { c: number; r: number } | null
    length: number
    food: { c: number; r: number } | null
    cols: number
    rows: number
    /** Full snake body, head first. Agents use this for self-collision avoidance. */
    body: { c: number; r: number }[]
}

let snap: SnakeSnapshot = {
    playing: false,
    paused: false,
    dead: false,
    score: 0,
    dir: "E",
    head: null,
    length: 0,
    food: null,
    cols: 0,
    rows: 0,
    body: [],
}

let pendingTurn: SnakeDir | null = null

export function publishSnakeSnapshot(next: SnakeSnapshot) {
    snap = next
}

export function readSnakeSnapshot(): SnakeSnapshot {
    return snap
}

/** Agent / UI queues a turn; EssayField consumes each tick. */
export function queueSnakeTurn(dir: SnakeDir) {
    pendingTurn = dir
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("geodesics-snake-kick"))
    }
}

export function consumeSnakeTurn(): SnakeDir | null {
    const d = pendingTurn
    pendingTurn = null
    return d
}

export function requestSnakeStart() {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("geodesics-snake-start"))
}

/** Toggle or set pause. No-op if engine not playing. */
export function requestSnakePause(paused?: boolean) {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("geodesics-snake-pause", { detail: { paused } }))
}

/** Agent-facing view: snapshot + food delta + play loop hint. */
export function snakeAgentView() {
    const s = readSnakeSnapshot()
    const engine = s.cols > 0 && s.rows > 0
    const food_delta =
        s.head && s.food
            ? { dc: s.food.c - s.head.c, dr: s.food.r - s.head.r }
            : null
    return {
        ...s,
        engine,
        food_delta,
        tick_hz: 9,
        loop: engine
            ? "geodesics_snake_start → geodesics_snake_state → geodesics_snake_turn(dir) → poll state. Eat food (+1). Avoid walls/self."
            : "Open / (landing essay). Engine mounts with the Pretext field.",
    }
}

let bestScore = 0

/** Best score this tab has seen (persists across deaths until reload). */
export function snakeBest(): number {
    return bestScore
}

export function noteScore(score: number) {
    if (score > bestScore) bestScore = score
}
