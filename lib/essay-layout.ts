export type Rect = { x: number; y: number; w: number; h: number }

export type Interval = { x: number; width: number }

/** Merge overlapping [x0,x1) ranges, then return free intervals inside [0, totalWidth]. */
export function freeIntervals(
    totalWidth: number,
    occupied: Array<{ left: number; right: number }>,
    gap = 0,
): Interval[] {
    if (totalWidth <= 0) return []
    const ranges = occupied
        .map((o) => ({
            left: Math.max(0, o.left - gap),
            right: Math.min(totalWidth, o.right + gap),
        }))
        .filter((o) => o.right > o.left)
        .sort((a, b) => a.left - b.left)

    const merged: Array<{ left: number; right: number }> = []
    for (const r of ranges) {
        const last = merged[merged.length - 1]
        if (!last || r.left > last.right) merged.push({ ...r })
        else last.right = Math.max(last.right, r.right)
    }

    const free: Interval[] = []
    let cursor = 0
    for (const m of merged) {
        if (m.left > cursor) free.push({ x: cursor, width: m.left - cursor })
        cursor = Math.max(cursor, m.right)
    }
    if (cursor < totalWidth) free.push({ x: cursor, width: totalWidth - cursor })
    return free.filter((f) => f.width >= 8)
}

export function rectsIntersectBand(rect: Rect, bandTop: number, bandBottom: number): boolean {
    return rect.y < bandBottom && rect.y + rect.h > bandTop
}

/** Occupied horizontal spans for a line band given void rects in the same coordinate space. */
export function occupiedForBand(
    voids: Rect[],
    bandTop: number,
    bandBottom: number,
): Array<{ left: number; right: number }> {
    const out: Array<{ left: number; right: number }> = []
    for (const v of voids) {
        if (!rectsIntersectBand(v, bandTop, bandBottom)) continue
        out.push({ left: v.x, right: v.x + v.w })
    }
    return out
}

export function clientRectRelativeTo(el: Element, root: DOMRect): Rect {
    const r = el.getBoundingClientRect()
    return {
        x: r.left - root.left,
        y: r.top - root.top,
        w: r.width,
        h: r.height,
    }
}
