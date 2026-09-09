"use client"

import { useGetWalletAccounts } from "@dynamic-labs-sdk/react-hooks"
import { useDynamicPassportReady } from "@/components/DynamicRoot"

export function DynamicWalletLine() {
    const ready = useDynamicPassportReady()
    if (!ready) return null
    return <DynamicWalletLineInner />
}

function DynamicWalletLineInner() {
    const { data: accounts = [] } = useGetWalletAccounts()
    const address = accounts[0]?.address
    return (
        <pre className="auth-terminal-out">
            {address ? `wallet     ${address.slice(0, 6)}…${address.slice(-4)}` : "wallet     minting…"}
        </pre>
    )
}
