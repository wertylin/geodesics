"use client"

import { useState } from "react"
import { useGetWalletAccounts } from "@dynamic-labs-sdk/react-hooks"
import { useDynamicPassportReady } from "@/components/DynamicRoot"

/** Passport settlement is silent — address only on explicit reveal. */
export function DynamicWalletLine() {
    const ready = useDynamicPassportReady()
    if (!ready) return null
    return <DynamicWalletLineInner />
}

function DynamicWalletLineInner() {
    const { data: accounts = [] } = useGetWalletAccounts()
    const address = accounts[0]?.address
    const [reveal, setReveal] = useState(false)

    return (
        <div className="auth-passport-line">
            <pre className="auth-terminal-out">
                {!address
                    ? "passport   ready · provisioning…"
                    : reveal
                      ? `passport   ${address.slice(0, 6)}…${address.slice(-4)}`
                      : "passport   ready"}
            </pre>
            {address ? (
                <button type="button" className="auth-terminal-back" onClick={() => setReveal((v) => !v)}>
                    {reveal ? "hide id ←" : "reveal id →"}
                </button>
            ) : null}
        </div>
    )
}
