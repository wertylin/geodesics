"use client"

const CX = 50
const CY = 50
const A = 36

function lemniscate(t: number) {
    const s = Math.sin(t)
    const c = Math.cos(t)
    const d = 1 + s * s
    return { x: CX + (A * c) / d, y: CY + (A * s * c) / d }
}

function lemniscatePath() {
    const steps = 96
    const pts = Array.from({ length: steps + 1 }, (_, i) => lemniscate((i / steps) * Math.PI * 2))
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z"
}

const PATH = lemniscatePath()

export function GeodesicsMark() {
    return (
        <svg className="geodesics-mark" viewBox="0 0 100 100" aria-hidden>
            <path className="mark-track" d={PATH} />
            <path className="mark-run" d={PATH} pathLength={1} />
        </svg>
    )
}
