import type { AgentLedgerEntry } from "@/lib/agent-ledger"

const g = globalThis as typeof globalThis & {
    __geodesicsLedger?: AgentLedgerEntry[]
    __geodesicsLedgerSubs?: Set<(entry: AgentLedgerEntry) => void>
}
const MAX = 200

function store(): AgentLedgerEntry[] {
    if (!g.__geodesicsLedger) g.__geodesicsLedger = []
    return g.__geodesicsLedger
}

function subscribers(): Set<(entry: AgentLedgerEntry) => void> {
    if (!g.__geodesicsLedgerSubs) g.__geodesicsLedgerSubs = new Set()
    return g.__geodesicsLedgerSubs
}

export function subscribeLedger(fn: (entry: AgentLedgerEntry) => void): () => void {
    const set = subscribers()
    set.add(fn)
    return () => {
        set.delete(fn)
    }
}

export async function appendLedger(entry: AgentLedgerEntry) {
    const list = store()
    list.unshift(entry)
    if (list.length > MAX) list.length = MAX
    for (const fn of subscribers()) {
        try {
            fn(entry)
        } catch {
            /* subscriber must not break append */
        }
    }
}

export async function readLedger(limit = 80): Promise<AgentLedgerEntry[]> {
    return store().slice(0, Math.max(1, Math.min(limit, MAX)))
}
