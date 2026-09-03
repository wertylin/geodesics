"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

export function JuryBeam() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const [code, setCode] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    if (dismissed) return null

    const submit = async (e: FormEvent) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
            const res = await fetch("/api/jury/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ code }),
            })
            const data = (await res.json().catch(() => ({}))) as { error?: string; href?: string }
            if (!res.ok || !data.href) {
                setError(typeof data.error === "string" ? data.error : "That code doesn't open a desk.")
                return
            }
            router.push(data.href)
        } finally {
            setBusy(false)
        }
    }

    return (
        <aside className="jury-beam" aria-label="WebMCP challenge jury">
            <div className="jury-filament" aria-hidden>
                <span className="jury-core" />
                <span className="jury-ray r1" />
                <span className="jury-ray r2" />
                <span className="jury-ray r3" />
            </div>
            <div className="jury-chip">
                {!open ? (
                    <>
                        <p>Are you on the WebMCP challenge jury?</p>
                        <div className="jury-chip-actions">
                            <button type="button" className="jury-yes" onClick={() => setOpen(true)}>
                                Yes
                            </button>
                            <button type="button" className="jury-no" onClick={() => setDismissed(true)}>
                                Just passing through
                            </button>
                        </div>
                    </>
                ) : (
                    <form onSubmit={submit} className="jury-code-form">
                        <label htmlFor="jury-code">Enter your desk code</label>
                        <input
                            id="jury-code"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="———— — — —"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            autoFocus
                        />
                        {error ? <small className="jury-error">{error}</small> : null}
                        <div className="jury-chip-actions">
                            <button type="submit" className="jury-yes" disabled={busy || !code.trim()}>
                                {busy ? "Opening…" : "Open desk"}
                            </button>
                            <button type="button" className="jury-no" onClick={() => setOpen(false)}>
                                Back
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </aside>
    )
}
