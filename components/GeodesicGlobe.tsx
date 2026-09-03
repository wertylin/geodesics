"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Trail } from "@/lib/trails"

type V3 = [number, number, number]

type Node = {
    key: string
    label: string
    href?: string
    trailIds: string[]
    v: V3
}

type Arc = {
    a: V3
    b: V3
    seed: number
    trailId: string
}

const LAND: [number, number][][] = [
    [
        [70, -165],
        [68, -140],
        [60, -137],
        [58, -135],
        [48, -125],
        [32, -117],
        [23, -110],
        [15, -93],
        [25, -80],
        [45, -67],
        [47, -52],
        [52, -56],
        [60, -65],
        [70, -95],
        [72, -140],
    ],
    [
        [12, -72],
        [8, -80],
        [-5, -81],
        [-20, -70],
        [-50, -75],
        [-55, -68],
        [-40, -62],
        [-23, -43],
        [-5, -35],
        [2, -50],
        [10, -62],
    ],
    [
        [71, 8],
        [71, 28],
        [64, 40],
        [60, 30],
        [54, 12],
        [43, 16],
        [36, 15],
        [36, -6],
        [43, -9],
        [58, 5],
        [67, 12],
    ],
    [
        [37, -10],
        [37, 11],
        [32, 32],
        [12, 51],
        [-5, 39],
        [-15, 42],
        [-35, 26],
        [-34, 18],
        [5, 8],
        [5, -8],
        [15, -17],
        [32, -10],
    ],
    [
        [75, 70],
        [72, 140],
        [62, 160],
        [50, 142],
        [30, 122],
        [22, 114],
        [8, 105],
        [1, 104],
        [8, 78],
        [22, 70],
        [25, 56],
        [36, 52],
        [40, 48],
        [55, 73],
        [68, 70],
    ],
    [
        [8, 98],
        [-8, 140],
        [-28, 153],
        [-39, 148],
        [-35, 115],
        [-22, 114],
        [-12, 131],
    ],
    [
        [83, -40],
        [72, -22],
        [60, -44],
        [68, -52],
        [76, -68],
        [82, -60],
    ],
]

const SEED: Trail[] = [
    {
        id: "seed-1",
        agent: "seed",
        origin: "arxiv.org",
        route: "search → paper → cite",
        status: "observed",
        age: "",
    },
    {
        id: "seed-2",
        agent: "seed",
        origin: "github.com",
        route: "repo → issues → pr",
        status: "observed",
        age: "",
    },
    {
        id: "seed-3",
        agent: "seed",
        origin: "wikipedia.org",
        route: "topic → cite → hop",
        status: "observed",
        age: "",
    },
    {
        id: "seed-4",
        agent: "seed",
        origin: "localhost:3000",
        route: "login → leave_trail",
        status: "observed",
        age: "",
    },
]

function hops(route: string): string[] {
    return route
        .split(/\s*→\s*|\s*>\s*|\s*\.\s+(?=[A-Z])|\s*;\s*|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
}

function hostOf(origin: string) {
    return origin.replace(/^https?:\/\//, "").split("/")[0] || origin
}

function hash32(s: string) {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

function llToV(lat: number, lng: number): V3 {
    const φ = (lat * Math.PI) / 180
    const λ = (lng * Math.PI) / 180
    const c = Math.cos(φ)
    return [c * Math.sin(λ), Math.sin(φ), c * Math.cos(λ)]
}

function keyToV(key: string): V3 {
    const h = hash32(key)
    const u = (h & 0xffff) / 0xffff
    const v = ((h >>> 16) & 0xffff) / 0xffff
    const lat = (Math.asin(2 * u - 1) * 180) / Math.PI
    const lng = v * 360 - 180
    return llToV(lat, lng)
}

function rot(v: V3, yaw: number, pitch: number): V3 {
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const x1 = v[0] * cy - v[2] * sy
    const z1 = v[0] * sy + v[2] * cy
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    return [x1, v[1] * cp - z1 * sp, v[1] * sp + z1 * cp]
}

function slerp(a: V3, b: V3, t: number): V3 {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    d = Math.min(1, Math.max(-1, d))
    const o = Math.acos(d)
    if (o < 1e-4) return a
    const s = Math.sin(o)
    const w0 = Math.sin((1 - t) * o) / s
    const w1 = Math.sin(t * o) / s
    const x = a[0] * w0 + b[0] * w1
    const y = a[1] * w0 + b[1] * w1
    const z = a[2] * w0 + b[2] * w1
    const n = Math.hypot(x, y, z) || 1
    return [x / n, y / n, z / n]
}

function project(v: V3, cx: number, cy: number, r: number) {
    const p = 1.28 / (2.15 - v[2])
    return { x: cx + v[0] * r * p, y: cy - v[1] * r * p, z: v[2], p }
}

function trailSteps(t: Trail) {
    return [hostOf(t.origin), ...hops(t.route)]
}

function buildGraph(trails: Trail[]) {
    const nodes = new Map<string, Node>()
    const arcs: Arc[] = []
    const put = (key: string, label: string, trailId: string, href?: string) => {
        const prev = nodes.get(key)
        if (prev) {
            if (href && !prev.href) prev.href = href
            if (!prev.trailIds.includes(trailId)) prev.trailIds.push(trailId)
            return prev
        }
        const n: Node = { key, label, href, trailIds: [trailId], v: keyToV(key) }
        nodes.set(key, n)
        return n
    }
    for (const t of trails) {
        const href = t.id.startsWith("seed-") ? undefined : `/trail/${t.id}`
        const steps = trailSteps(t)
        const pts: Node[] = steps.map((s, i) => put(i === 0 ? `o:${s}` : `h:${s}`, s, t.id, href))
        for (let i = 1; i < pts.length; i++) {
            arcs.push({ a: pts[i - 1].v, b: pts[i].v, seed: hash32(t.id + i), trailId: t.id })
        }
    }
    return { nodes: [...nodes.values()], arcs }
}

function aimAt(v: V3) {
    const yaw = Math.atan2(v[0], v[2])
    const z1 = v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)
    const pitch = Math.min(1.1, Math.max(-1.1, Math.atan2(v[1], z1)))
    return { yaw, pitch }
}

function trailAim(trails: Trail[], id: string) {
    const t = trails.find((row) => row.id === id)
    if (!t) return null
    const steps = trailSteps(t)
    const mid = steps[Math.floor((steps.length - 1) / 2)] ?? steps[0]
    const i = steps.indexOf(mid)
    return aimAt(keyToV(i === 0 ? `o:${mid}` : `h:${mid}`))
}

function lerpAngle(a: number, b: number, t: number) {
    let d = b - a
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return a + d * t
}

function strokeChain(
    ctx: CanvasRenderingContext2D,
    pts: { x: number; y: number; z: number }[],
    front: boolean,
    style: (ctx: CanvasRenderingContext2D) => void,
) {
    let drawing = false
    ctx.beginPath()
    for (const p of pts) {
        const ok = front ? p.z >= -0.02 : p.z < -0.02
        if (!ok) {
            drawing = false
            continue
        }
        if (!drawing) {
            ctx.moveTo(p.x, p.y)
            drawing = true
        } else ctx.lineTo(p.x, p.y)
    }
    style(ctx)
    ctx.stroke()
}

export function GeodesicGlobe({
    trails,
    compact = false,
    focusId = null,
    focusNonce = 0,
    onSelect,
}: {
    trails: Trail[]
    compact?: boolean
    focusId?: string | null
    focusNonce?: number
    onSelect?: (id: string) => void
}) {
    const router = useRouter()
    const wrapRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const yaw = useRef(0.55)
    const pitch = useRef(0.28)
    const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
    const hoverKey = useRef<string | null>(null)
    const focusRef = useRef(focusId)
    const onSelectRef = useRef(onSelect)
    const aimRef = useRef<{ yaw: number; pitch: number } | null>(null)
    const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null)
    const reduce = useRef(false)
    focusRef.current = focusId
    onSelectRef.current = onSelect

    const shown = useMemo(() => {
        const rows = trails.slice(0, 18)
        if (focusId && !rows.some((t) => t.id === focusId)) {
            const extra = trails.find((t) => t.id === focusId)
            if (extra) rows.push(extra)
        }
        return rows
    }, [trails, focusId])
    const trailKey = shown.map((t) => `${t.id}:${t.route}`).join("|")
    const liveCount = trails.length
    const graph = useMemo(() => buildGraph(trailKey ? shown : SEED), [trailKey, shown])
    const graphRef = useRef(graph)
    graphRef.current = graph

    useEffect(() => {
        if (!focusId) {
            aimRef.current = null
            return
        }
        aimRef.current = trailAim(shown, focusId)
    }, [focusId, focusNonce, shown])

    useEffect(() => {
        reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        const canvas = canvasRef.current
        const wrap = wrapRef.current
        if (!canvas || !wrap) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        let raf = 0
        let last = performance.now()
        let visible = true
        const nodesHit: { node: Node; x: number; y: number; z: number }[] = []

        const grid: V3[][] = []
        for (let i = 0; i < 12; i++) {
            const λ = (i / 12) * Math.PI * 2
            const mer: V3[] = []
            for (let j = 0; j <= 36; j++) mer.push(llToV(-90 + (j * 180) / 36, (λ * 180) / Math.PI))
            grid.push(mer)
        }
        for (let i = 1; i < 6; i++) {
            const φ = -60 + i * 24
            const par: V3[] = []
            for (let j = 0; j <= 48; j++) par.push(llToV(φ, (j * 360) / 48))
            grid.push(par)
        }
        const land = LAND.map((ring) => ring.map(([lat, lng]) => llToV(lat, lng)))

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            const w = wrap.clientWidth
            const h = wrap.clientHeight
            canvas.width = Math.max(1, Math.floor(w * dpr))
            canvas.height = Math.max(1, Math.floor(h * dpr))
            canvas.style.width = `${w}px`
            canvas.style.height = `${h}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(wrap)
        const io = new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting
        })
        io.observe(wrap)

        const draw = (now: number) => {
            raf = requestAnimationFrame(draw)
            if (!visible) {
                last = now
                return
            }
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const aim = aimRef.current
            if (drag.current) {
                aimRef.current = null
            } else if (aim) {
                yaw.current = lerpAngle(yaw.current, aim.yaw, Math.min(1, dt * 3.4))
                pitch.current += (aim.pitch - pitch.current) * Math.min(1, dt * 3.4)
                let dy = aim.yaw - yaw.current
                while (dy > Math.PI) dy -= Math.PI * 2
                while (dy < -Math.PI) dy += Math.PI * 2
                if (Math.abs(dy) < 0.02 && Math.abs(aim.pitch - pitch.current) < 0.02) aimRef.current = null
            } else if (!reduce.current && !focusRef.current) {
                yaw.current += dt * 0.18
            } else if (!reduce.current) {
                yaw.current += dt * 0.05
            }

            const w = wrap.clientWidth
            const h = wrap.clientHeight
            const cx = w * 0.5
            const cy = h * 0.52
            const r = Math.min(w, h) * (compact ? 0.42 : 0.38)
            const Y = yaw.current
            const P = pitch.current

            ctx.clearRect(0, 0, w, h)

            const halo = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.45)
            halo.addColorStop(0, "rgba(198,243,107,0.07)")
            halo.addColorStop(0.55, "rgba(198,243,107,0.03)")
            halo.addColorStop(1, "rgba(10,12,11,0)")
            ctx.fillStyle = halo
            ctx.beginPath()
            ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2)
            ctx.fill()

            const xf = (v: V3) => project(rot(v, Y, P), cx, cy, r)

            const disk = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.32, r * 0.1, cx, cy, r)
            disk.addColorStop(0, "#18211c")
            disk.addColorStop(0.55, "#101613")
            disk.addColorStop(1, "#070908")
            ctx.beginPath()
            ctx.arc(cx, cy, r * 0.99, 0, Math.PI * 2)
            ctx.fillStyle = disk
            ctx.fill()

            const mapLine = (line: V3[]) => line.map(xf)

            for (const line of grid) {
                const pts = mapLine(line)
                strokeChain(ctx, pts, false, (c) => {
                    c.strokeStyle = "rgba(102,116,101,0.16)"
                    c.lineWidth = 0.7
                })
            }
            for (const ring of land) {
                strokeChain(ctx, mapLine(ring), false, (c) => {
                    c.strokeStyle = "rgba(157,176,150,0.18)"
                    c.lineWidth = 1
                })
            }
            const { nodes, arcs } = graphRef.current
            const fid = focusRef.current
            const isHot = (id: string) => !fid || id === fid
            for (const arc of arcs) {
                const pts = []
                for (let i = 0; i <= 28; i++) pts.push(xf(slerp(arc.a, arc.b, i / 28)))
                strokeChain(ctx, pts, false, (c) => {
                    c.strokeStyle = isHot(arc.trailId) ? "rgba(198,243,107,0.16)" : "rgba(198,243,107,0.04)"
                    c.lineWidth = 1.1
                })
            }

            ctx.save()
            ctx.beginPath()
            ctx.arc(cx, cy, r * 0.99, 0, Math.PI * 2)
            ctx.clip()

            for (const line of grid) {
                strokeChain(ctx, mapLine(line), true, (c) => {
                    c.strokeStyle = "rgba(121,138,120,0.38)"
                    c.lineWidth = 0.85
                })
            }
            for (const ring of land) {
                strokeChain(ctx, mapLine(ring), true, (c) => {
                    c.strokeStyle = "rgba(201,214,190,0.55)"
                    c.lineWidth = 1.15
                })
            }

            ctx.setLineDash([5, 7])
            ctx.lineDashOffset = -now / 90
            for (const arc of arcs) {
                if (!isHot(arc.trailId)) continue
                const pts = []
                for (let i = 0; i <= 32; i++) pts.push(xf(slerp(arc.a, arc.b, i / 32)))
                strokeChain(ctx, pts, true, (c) => {
                    c.strokeStyle = "rgba(198,243,107,0.9)"
                    c.lineWidth = 1.85
                    c.shadowColor = "rgba(198,243,107,0.5)"
                    c.shadowBlur = 10
                })
            }
            ctx.setLineDash([])
            ctx.shadowBlur = 0
            for (const arc of arcs) {
                if (isHot(arc.trailId)) continue
                const pts = []
                for (let i = 0; i <= 24; i++) pts.push(xf(slerp(arc.a, arc.b, i / 24)))
                strokeChain(ctx, pts, true, (c) => {
                    c.strokeStyle = "rgba(198,243,107,0.18)"
                    c.lineWidth = 1
                })
            }

            for (const arc of arcs) {
                if (!isHot(arc.trailId)) continue
                const t = (now / 2800 + (arc.seed % 1000) / 1000) % 1
                const p = xf(slerp(arc.a, arc.b, t))
                if (p.z < 0.02) continue
                ctx.beginPath()
                ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2)
                ctx.fillStyle = "#c6f36b"
                ctx.fill()
            }

            nodesHit.length = 0
            for (const node of nodes) {
                const p = xf(node.v)
                if (p.z < -0.05) continue
                nodesHit.push({ node, x: p.x, y: p.y, z: p.z })
                const onTrail = node.trailIds.some(isHot)
                const hot = hoverKey.current === node.key
                ctx.beginPath()
                ctx.arc(p.x, p.y, hot ? 5.4 : onTrail ? 3.6 : 2.2, 0, Math.PI * 2)
                ctx.fillStyle = hot || onTrail ? "#c6f36b" : "#0a0c0b"
                ctx.fill()
                ctx.strokeStyle = onTrail ? "#c6f36b" : "rgba(198,243,107,0.35)"
                ctx.lineWidth = onTrail ? 1.4 : 1
                ctx.stroke()
            }
            ctx.restore()

            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.strokeStyle = "rgba(198,243,107,0.28)"
            ctx.lineWidth = 1.2
            ctx.stroke()

            const shade = ctx.createLinearGradient(cx - r, cy, cx + r, cy)
            shade.addColorStop(0, "rgba(0,0,0,0.35)")
            shade.addColorStop(0.45, "rgba(0,0,0,0)")
            shade.addColorStop(1, "rgba(198,243,107,0.05)")
            ctx.beginPath()
            ctx.arc(cx, cy, r * 0.99, 0, Math.PI * 2)
            ctx.fillStyle = shade
            ctx.fill()
        }

        raf = requestAnimationFrame(draw)

        const pick = (x: number, y: number) => {
            let best: (typeof nodesHit)[0] | null = null
            let d0 = 16
            for (const n of nodesHit) {
                const d = Math.hypot(n.x - x, n.y - y)
                if (d < d0) {
                    d0 = d
                    best = n
                }
            }
            return best
        }

        const onDown = (e: PointerEvent) => {
            drag.current = { x: e.clientX, y: e.clientY, moved: false }
            canvas.setPointerCapture(e.pointerId)
        }
        const onMove = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect()
            const lx = e.clientX - rect.left
            const ly = e.clientY - rect.top
            if (drag.current) {
                const dx = e.clientX - drag.current.x
                const dy = e.clientY - drag.current.y
                if (Math.hypot(dx, dy) > 3) drag.current.moved = true
                yaw.current += dx * 0.005
                pitch.current = Math.min(1.1, Math.max(-1.1, pitch.current + dy * 0.005))
                drag.current.x = e.clientX
                drag.current.y = e.clientY
            }
            const hit = pick(lx, ly)
            const next = hit?.node.key ?? null
            if (next !== hoverKey.current) {
                hoverKey.current = next
                setTip(hit ? { label: hit.node.label, x: hit.x, y: hit.y } : null)
            } else if (hit) setTip({ label: hit.node.label, x: hit.x, y: hit.y })
        }
        const onUp = (e: PointerEvent) => {
            const d = drag.current
            drag.current = null
            if (d?.moved) return
            const rect = canvas.getBoundingClientRect()
            const hit = pick(e.clientX - rect.left, e.clientY - rect.top)
            const ids = hit?.node.trailIds.filter((id) => !id.startsWith("seed-")) ?? []
            if (onSelectRef.current && ids.length) {
                onSelectRef.current(ids.find((id) => id !== focusRef.current) ?? ids[0])
            } else if (hit?.node.href) {
                router.push(hit.node.href)
            }
        }
        const onLeave = () => {
            hoverKey.current = null
            setTip(null)
        }

        canvas.addEventListener("pointerdown", onDown)
        canvas.addEventListener("pointermove", onMove)
        canvas.addEventListener("pointerup", onUp)
        canvas.addEventListener("pointerleave", onLeave)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            canvas.removeEventListener("pointerdown", onDown)
            canvas.removeEventListener("pointermove", onMove)
            canvas.removeEventListener("pointerup", onUp)
            canvas.removeEventListener("pointerleave", onLeave)
        }
    }, [compact, router])

    return (
        <div ref={wrapRef} className={compact ? "globe-figure compact" : "globe-figure"}>
            <canvas ref={canvasRef} aria-label="3D globe of geodesic trails" />
            {tip ? (
                <span className="globe-tip" style={{ left: tip.x, top: tip.y }}>
                    {tip.label}
                </span>
            ) : null}
            <div className="globe-hud">
                <span>great circles</span>
                <strong>{String(liveCount || graph.nodes.length).padStart(3, "0")}</strong>
            </div>
        </div>
    )
}
