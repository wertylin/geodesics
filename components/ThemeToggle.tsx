"use client"

import { useEffect } from "react"
import { THEME_KEY, applyTheme, nextTheme, normalizeTheme, resolveTheme, type Theme } from "@/lib/theme"

function currentTheme(): Theme {
    return normalizeTheme(document.documentElement.getAttribute("data-theme")) ?? resolveTheme(localStorage.getItem(THEME_KEY))
}

export function ThemeToggle() {
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== THEME_KEY) return
            applyTheme(resolveTheme(e.newValue))
        }
        window.addEventListener("storage", onStorage)
        return () => window.removeEventListener("storage", onStorage)
    }, [])
    return (
        <button
            type="button"
            className="theme-toggle"
            aria-label="Cycle light, dark, and organizma"
            onClick={() => {
                const next = nextTheme(currentTheme())
                localStorage.setItem(THEME_KEY, next)
                applyTheme(next)
            }}
        >
            <span className="theme-toggle-to-dark">Dark</span>
            <span className="theme-toggle-to-organizma">Organizma</span>
            <span className="theme-toggle-to-light">Light</span>
        </button>
    )
}
