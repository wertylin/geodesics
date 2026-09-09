"use client"

import { useState } from "react"
import { useSendEmailOTP, useVerifyOTP } from "@dynamic-labs-sdk/react-hooks"

export function DynamicHumanAuth({ onStatus }: { onStatus?: (line: string) => void }) {
    const [email, setEmail] = useState("")
    const [code, setCode] = useState("")
    const { mutate: sendEmailOTP, data: otpVerification, isPending: sending } = useSendEmailOTP()
    const { mutate: verifyOTP, isPending: verifying } = useVerifyOTP()

    if (!otpVerification) {
        return (
            <form
                className="auth-terminal-form"
                onSubmit={(e) => {
                    e.preventDefault()
                    const next = email.trim()
                    if (!next.includes("@")) {
                        onStatus?.("error: email required")
                        return
                    }
                    onStatus?.(`auth --path dynamic --email ${next}`)
                    sendEmailOTP(
                        { email: next },
                        {
                            onError: (err) => onStatus?.(`err · ${err.message}`),
                            onSuccess: () => onStatus?.("otp sent · check mail"),
                        }
                    )
                }}
            >
                <label>
                    <span>email</span>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@…"
                        autoComplete="email"
                    />
                </label>
                <div className="auth-terminal-cmds">
                    <button type="submit" className="auth-terminal-run" disabled={sending}>
                        {sending ? "…" : "send Dynamic OTP →"}
                    </button>
                </div>
            </form>
        )
    }

    return (
        <form
            className="auth-terminal-form"
            onSubmit={(e) => {
                e.preventDefault()
                const token = code.trim()
                if (!token) {
                    onStatus?.("error: otp required")
                    return
                }
                onStatus?.("verify --otp …")
                verifyOTP(
                    { otpVerification, verificationToken: token },
                    {
                        onError: (err) => onStatus?.(`err · ${err.message}`),
                        onSuccess: () => onStatus?.("ok · Dynamic passport · minting couple cookie"),
                    }
                )
            }}
        >
            <label>
                <span>otp</span>
                <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                />
            </label>
            <div className="auth-terminal-cmds">
                <button type="submit" className="auth-terminal-run" disabled={verifying}>
                    {verifying ? "…" : "verify passport →"}
                </button>
            </div>
        </form>
    )
}
