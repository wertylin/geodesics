import type { AgentLedgerEntry } from "@/lib/agent-ledger"

const g = globalThis as typeof globalThis & { __geodesicsLedger?: AgentLedgerEntry[] }
const MAX = 200

function store(): AgentLedgerEntry[] {
    if (!g.__geodesicsLedger) g.__geodesicsLedger = []
    return g.__geodesicsLedger
}

export async function appendLedger(entry: AgentLedgerEntry) {
    const list = store()
    list.unshift(entry)
    if (list.length > MAX) list.length = MAX
}

export async function readLedger(limit = 80): Promise<AgentLedgerEntry[]> {
    return store().slice(0, Math.max(1, Math.min(limit, MAX)))
}
