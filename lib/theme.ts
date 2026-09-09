export const THEME_KEY = "geodesics-theme"
export type Theme = "light" | "dark" | "organizma"

export const THEME_ORDER: Theme[] = ["light", "dark", "organizma"]
export const DEFAULT_THEME: Theme = "organizma"

export const THEME_COLORS: Record<Theme, string> = {
    light: "#f4ebe3",
    dark: "#12080a",
    organizma: "#000000",
}

export function normalizeTheme(value: string | null): Theme | null {
    if (value === "organism" || value === "organizma") return "organizma"
    if (value === "light" || value === "dark") return value
    return null
}

export function isTheme(value: string | null): value is Theme {
    return normalizeTheme(value) !== null && value !== "organism"
}

export function resolveTheme(stored: string | null): Theme {
    return normalizeTheme(stored) ?? DEFAULT_THEME
}

export function nextTheme(theme: Theme): Theme {
    const i = THEME_ORDER.indexOf(theme)
    return THEME_ORDER[(i < 0 ? 2 : i + 1) % THEME_ORDER.length]
}

export function applyTheme(theme: Theme) {
    const root = document.documentElement
    root.setAttribute("data-theme", theme)
    root.style.colorScheme = theme === "light" ? "light" : "dark"
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme])
}

export const THEME_BOOT = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var t=localStorage.getItem(k);if(t==="organism")t="organizma";if(t!=="light"&&t!=="dark"&&t!=="organizma")t="organizma";var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t==="light"?"light":"dark"}catch(e){document.documentElement.setAttribute("data-theme","organizma")}})();`
