"use client"

import {
    layoutNextLineRange,
    materializeLineRange,
    prepareWithSegments,
    type LayoutCursor,
    type PreparedTextWithSegments,
} from "@chenglou/pretext"
import { useEffect, useRef, type RefObject } from "react"
import {
    clientRectRelativeTo,
    freeIntervals,
    occupiedForBand,
    type Rect,
} from "@/lib/essay-layout"
import { fillEssay } from "@/lib/landing-essay"
import {
    clearSnakeDeath,
    consumeSnakeTurn,
    notifySnakeDeath,
    publishSnakeSnapshot,
    type SnakeDir,
} from "@/lib/snake-runtime"

export type EssayVoidSource = RefObject<HTMLElement | null>

type Dir = SnakeDir
type Cell = { c: number; r: number }

type SnakeState = {
    playing: boolean
    paused: boolean
    body: Cell[]
    dir: Dir
    pending: Dir | null
    food: Cell
    score: number
    tickAcc: number
    dead: boolean
    /** Sources eaten this run: index, cell, tick timestamp. */
    sources: { i: number; c: number; r: number; t: number }[]
}

const LINE_HEIGHT = 16
const FONT_SIZE = 11
const VOID_PAD = 14
const CELL = 14
const TICK_MS = 110
const MIN_SEG_W = 28

function canvasFont(): string {
    const ff =
        getComputedStyle(document.documentElement).getPropertyValue("--font-ui").trim() ||
        '"IBM Plex Mono", ui-monospace, monospace'
    return `400 ${FONT_SIZE}px ${ff}`
}

function essayColor(el: HTMLElement): string {
    const s = getComputedStyle(el)
    return s.getPropertyValue("--essay-ink").trim() || s.color || "rgba(255,255,255,0.28)"
}

function foodColor(el: HTMLElement): string {
    return getComputedStyle(el).getPropertyValue("--lime").trim() || "#ff2a3c"
}

function snakeColor(el: HTMLElement): string {
    const s = getComputedStyle(el)
    return s.getPropertyValue("--essay-snake").trim() || s.getPropertyValue("--ink").trim() || "#111"
}

function opposite(a: Dir, b: Dir): boolean {
    return (
        (a === "N" && b === "S") ||
        (a === "S" && b === "N") ||
        (a === "E" && b === "W") ||
        (a === "W" && b === "E")
    )
}

function stepCell(cell: Cell, dir: Dir): Cell {
    if (dir === "N") return { c: cell.c, r: cell.r - 1 }
    if (dir === "S") return { c: cell.c, r: cell.r + 1 }
    if (dir === "W") return { c: cell.c - 1, r: cell.r }
    return { c: cell.c + 1, r: cell.r }
}

function cellRect(cell: Cell, originX: number, originY: number): Rect {
    return {
        x: originX + cell.c * CELL,
        y: originY + cell.r * CELL,
        w: CELL,
        h: CELL,
    }
}

function randomFood(cols: number, rows: number, blocked: Set<string>): Cell {
    for (let i = 0; i < 80; i++) {
        const c = 1 + Math.floor(Math.random() * Math.max(1, cols - 2))
        const r = 1 + Math.floor(Math.random() * Math.max(1, rows - 2))
        const key = `${c},${r}`
        if (!blocked.has(key)) return { c, r }
    }
    return { c: Math.floor(cols / 2), r: Math.floor(rows / 2) }
}

function freshSnake(cols: number, rows: number): SnakeState {
    const head = { c: Math.floor(cols / 2), r: Math.floor(rows / 2) }
    const body = [head, { c: head.c - 1, r: head.r }, { c: head.c - 2, r: head.r }]
    const blocked = new Set(body.map((b) => `${b.c},${b.r}`))
    return {
        playing: false,
        paused: false,
        body,
        dir: "E",
        pending: null,
        food: randomFood(cols, rows, blocked),
        score: 0,
        tickAcc: 0,
        dead: false,
        sources: [],
    }
}

type Props = {
    voidRefs: EssayVoidSource[]
    extraVoids?: Rect[]
    playable?: boolean
    className?: string
}

export function EssayField({ voidRefs, extraVoids, playable = true, className }: Props) {
    const wrapRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const preparedRef = useRef<PreparedTextWithSegments | null>(null)
    const fontRef = useRef("")
    const snakeRef = useRef<SnakeState | null>(null)
    const gridRef = useRef({ cols: 40, rows: 24, ox: 0, oy: 0 })
    const extrasRef = useRef(extraVoids)
    extrasRef.current = extraVoids

    useEffect(() => {
        const wrap = wrapRef.current
        const canvas = canvasRef.current
        if (!wrap || !canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        let raf = 0
        let alive = true
        let lastTs = performance.now()
        let deathNotified = false

        const ensurePrepared = () => {
            const font = canvasFont()
            if (preparedRef.current && fontRef.current === font) return preparedRef.current
            fontRef.current = font
            const text = fillEssay(48_000)
            preparedRef.current = prepareWithSegments(text, font)
            return preparedRef.current
        }

        const measureUiVoids = (): Rect[] => {
            const root = wrap.getBoundingClientRect()
            const voids: Rect[] = []
            for (const ref of voidRefs) {
                const el = ref.current
                if (!el) continue
                const r = clientRectRelativeTo(el, root)
                if (r.w > 4 && r.h > 4) voids.push(r)
            }
            if (extrasRef.current?.length) voids.push(...extrasRef.current)
            return voids
        }

        const syncGrid = (w: number, h: number) => {
            const cols = Math.max(12, Math.floor(w / CELL))
            const rows = Math.max(10, Math.floor(h / CELL))
            const ox = Math.floor((w - cols * CELL) / 2)
            const oy = Math.floor((h - rows * CELL) / 2)
            gridRef.current = { cols, rows, ox, oy }
            if (!snakeRef.current) snakeRef.current = freshSnake(cols, rows)
        }

        const snakeVoids = (): Rect[] => {
            const s = snakeRef.current
            if (!s?.playing) return []
            const { ox, oy } = gridRef.current
            const voids = s.body.map((cell) => cellRect(cell, ox, oy))
            voids.push(cellRect(s.food, ox, oy))
            return voids
        }

        const paintEssay = (w: number, h: number, uiVoids: Rect[]) => {
            const prepared = ensurePrepared()
            const voids = [...uiVoids, ...snakeVoids()]
            ctx.fillStyle = essayColor(wrap)
            ctx.font = fontRef.current
            ctx.textBaseline = "top"

            let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
            let y = 8
            let guard = 0
            while (y + LINE_HEIGHT <= h - 8 && guard++ < 400) {
                const bandTop = y
                const bandBottom = y + LINE_HEIGHT
                const occupied = occupiedForBand(voids, bandTop, bandBottom)
                const free = freeIntervals(w, occupied, VOID_PAD)
                if (!free.length) {
                    y += LINE_HEIGHT
                    continue
                }
                for (const seg of free) {
                    if (seg.width < MIN_SEG_W) continue
                    let range = layoutNextLineRange(prepared, cursor, seg.width)
                    if (!range) {
                        // Loop manifesto — full-bleed lines eat text fast; never leave bottom bare.
                        cursor = { segmentIndex: 0, graphemeIndex: 0 }
                        range = layoutNextLineRange(prepared, cursor, seg.width)
                    }
                    if (!range) continue
                    const line = materializeLineRange(prepared, range)
                    if (line.text) ctx.fillText(line.text, seg.x, y)
                    cursor = range.end
                }
                y += LINE_HEIGHT
            }
        }

        const paintSnake = () => {
            const s = snakeRef.current
            if (!s?.playing) return
            const { ox, oy } = gridRef.current
            ctx.fillStyle = foodColor(wrap)
            const fr = cellRect(s.food, ox, oy)
            ctx.fillRect(fr.x + 2, fr.y + 2, CELL - 4, CELL - 4)

            ctx.fillStyle = snakeColor(wrap)
            s.body.forEach((cell, i) => {
                const r = cellRect(cell, ox, oy)
                const inset = i === 0 ? 1 : 2
                ctx.fillRect(r.x + inset, r.y + inset, CELL - inset * 2, CELL - inset * 2)
                if (i === 0) {
                    ctx.fillStyle = foodColor(wrap)
                    const eye = 2
                    if (s.dir === "E" || s.dir === "W") {
                        const ex = s.dir === "E" ? r.x + CELL - 5 : r.x + 3
                        ctx.fillRect(ex, r.y + 3, eye, eye)
                        ctx.fillRect(ex, r.y + CELL - 5, eye, eye)
                    } else {
                        const ey = s.dir === "S" ? r.y + CELL - 5 : r.y + 3
                        ctx.fillRect(r.x + 3, ey, eye, eye)
                        ctx.fillRect(r.x + CELL - 5, ey, eye, eye)
                    }
                    ctx.fillStyle = snakeColor(wrap)
                }
            })
        }

        const paintHud = (w: number, h: number) => {
            if (!playable) return
            const s = snakeRef.current
            ctx.textBaseline = "bottom"
            if (!s?.playing) {
                ctx.fillStyle = essayColor(wrap)
                ctx.font = canvasFont()
                ctx.fillText("[ space ] play · arrows / wasd", 16, h - 10)
                return
            }
            ctx.fillStyle = snakeColor(wrap)
            ctx.font = canvasFont()
            const status = s.paused ? " · paused" : s.dead ? " · dead — space" : ""
            ctx.fillText(`score ${s.score}${status}`, 16, h - 10)
            ctx.textAlign = "right"
            ctx.fillStyle = essayColor(wrap)
            ctx.fillText("p pause · space", w - 16, h - 10)
            ctx.textAlign = "left"
        }

        const advanceSnake = () => {
            const s = snakeRef.current
            if (!s || !s.playing || s.paused || s.dead) return
            if (s.pending && !opposite(s.pending, s.dir)) s.dir = s.pending
            s.pending = null
            const { cols, rows } = gridRef.current
            const next = stepCell(s.body[0], s.dir)
            if (next.c < 0 || next.r < 0 || next.c >= cols || next.r >= rows) {
                s.dead = true
                return
            }
            if (s.body.some((b) => b.c === next.c && b.r === next.r)) {
                s.dead = true
                return
            }
            const ate = next.c === s.food.c && next.r === s.food.r
            s.body.unshift(next)
            if (ate) {
                s.score += 1
                s.sources.push({ i: s.score, c: next.c, r: next.r, t: Date.now() })
                const blocked = new Set(s.body.map((b) => `${b.c},${b.r}`))
                s.food = randomFood(cols, rows, blocked)
            } else {
                s.body.pop()
            }
        }

        const frame = (ts: number) => {
            if (!alive) return
            const dt = Math.min(48, ts - lastTs)
            lastTs = ts

            const dpr = Math.min(2, window.devicePixelRatio || 1)
            const rect = wrap.getBoundingClientRect()
            const w = Math.max(1, Math.floor(rect.width))
            const h = Math.max(1, Math.floor(rect.height))
            const bw = Math.floor(w * dpr)
            const bh = Math.floor(h * dpr)
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw
                canvas.height = bh
                canvas.style.width = `${w}px`
                canvas.style.height = `${h}px`
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.clearRect(0, 0, w, h)

            syncGrid(w, h)
            const s = snakeRef.current
            if (s?.playing && !s.paused && !s.dead) {
                const queued = consumeSnakeTurn()
                if (queued) s.pending = queued
                s.tickAcc += dt
                while (s.tickAcc >= TICK_MS) {
                    s.tickAcc -= TICK_MS
                    advanceSnake()
                }
            }

            const live = snakeRef.current
            const { cols, rows } = gridRef.current
            if (live?.dead && !deathNotified) {
                deathNotified = true
                notifySnakeDeath(live.score, live.sources)
            }
            if (live && !live.dead) deathNotified = false
            publishSnakeSnapshot({
                playing: Boolean(live?.playing),
                paused: Boolean(live?.paused),
                dead: Boolean(live?.dead),
                score: live?.score ?? 0,
                dir: live?.dir ?? "E",
                head: live?.body[0] ?? null,
                length: live?.body.length ?? 0,
                food: live?.food ?? null,
                cols,
                rows,
                body: live?.body ?? [],
                sources: live?.sources ?? [],
            })

            const stage = wrap.closest(".landing-stage")
            if (stage instanceof HTMLElement) {
                // Keep chrome/frame hidden for the whole run (incl. pause / death).
                stage.dataset.playing = live?.playing ? "true" : "false"
            }

            paintEssay(w, h, measureUiVoids())
            paintSnake()
            paintHud(w, h)

            const needRaf = Boolean(s?.playing && !s.paused && !s.dead)
            if (needRaf) raf = requestAnimationFrame(frame)
            else raf = 0
        }

        const kick = () => {
            if (!alive) return
            if (raf) cancelAnimationFrame(raf)
            raf = requestAnimationFrame(frame)
        }

        const onKey = (e: KeyboardEvent) => {
            if (!playable) return
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return

            const s = snakeRef.current
            if (!s) return

            if (e.key === " " || e.code === "Space") {
                e.preventDefault()
                if (!s.playing || s.dead) {
                    const { cols, rows } = gridRef.current
                    snakeRef.current = { ...freshSnake(cols, rows), playing: true }
                    deathNotified = false
                    clearSnakeDeath()
                } else {
                    s.paused = !s.paused
                }
                kick()
                return
            }
            if (!s.playing || s.dead) return
            if (e.key === "p" || e.key === "P") {
                s.paused = !s.paused
                kick()
                return
            }
            let dir: Dir | null = null
            if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") dir = "N"
            else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") dir = "S"
            else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") dir = "W"
            else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dir = "E"
            if (!dir) return
            e.preventDefault()
            s.pending = dir
            kick()
        }

        const ro = new ResizeObserver(() => kick())
        ro.observe(wrap)
        for (const ref of voidRefs) {
            if (ref.current) ro.observe(ref.current)
        }

        const mo = new MutationObserver(() => kick())
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

        const onStart = () => {
            const { cols, rows } = gridRef.current
            snakeRef.current = { ...freshSnake(cols, rows), playing: true }
            deathNotified = false
            clearSnakeDeath()
            kick()
        }

        const onPause = (e: Event) => {
            const s = snakeRef.current
            if (!s?.playing || s.dead) return
            const detail = (e as CustomEvent<{ paused?: boolean }>).detail
            if (typeof detail?.paused === "boolean") s.paused = detail.paused
            else s.paused = !s.paused
            kick()
        }

        window.addEventListener("keydown", onKey)
        window.addEventListener("geodesics-snake-start", onStart)
        window.addEventListener("geodesics-snake-pause", onPause)
        window.addEventListener("geodesics-snake-kick", kick)
        document.fonts.ready.then(() => {
            preparedRef.current = null
            kick()
        })
        kick()

        return () => {
            alive = false
            cancelAnimationFrame(raf)
            ro.disconnect()
            mo.disconnect()
            window.removeEventListener("keydown", onKey)
            window.removeEventListener("geodesics-snake-start", onStart)
            window.removeEventListener("geodesics-snake-pause", onPause)
            window.removeEventListener("geodesics-snake-kick", kick)
            publishSnakeSnapshot({
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
                sources: [],
            })
        }
    }, [voidRefs, playable])

    return (
        <div ref={wrapRef} className={className ?? "essay-field"} aria-hidden>
            <canvas ref={canvasRef} className="essay-field-canvas" />
        </div>
    )
}
