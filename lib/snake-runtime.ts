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
