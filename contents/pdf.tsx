import { useEffect, useRef, useState } from "react"
import type { PlasmoCSConfig, PlasmoGetRootContainer } from "plasmo"
import { THEMES, type ThemeId, DEFAULT_THEME } from "../theme"

// Injects dictionary popup on all websites except native PDFs.

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "file://*/*.pdf",
    "file://*/*.PDF"
  ]
}

export const getRootContainer: PlasmoGetRootContainer = () => {
  if (typeof document === "undefined" || !document.documentElement) return null

  const isHostedMozillaViewer =
    window.location.hostname === "mozilla.github.io" &&
    window.location.pathname.includes("/pdf.js/web/viewer.html")

  // Skip raw PDF tabs — they have no standard HTML body
  const isNativePdf =
    document.contentType === "application/pdf" ||
    window.location.pathname.toLowerCase().endsWith(".pdf") ||
    window.location.href.toLowerCase().includes(".pdf?")
  if (isNativePdf && !isHostedMozillaViewer) return null

  // Skip our own extension pages
  if (
    window.location.protocol === "chrome-extension:" ||
    window.location.protocol === "edge-extension:"
  ) return null

  // Create a transparent container for the Plasmo Shadow DOM UI.
  const existing = document.getElementById("wordlens-csui-host")
  if (existing) return existing

  const host = document.createElement("div")
  host.id = "wordlens-csui-host"
  // Zero-size, non-interactive, always on top — completely transparent to page layout
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;overflow:visible;"
  document.documentElement.appendChild(host)
  return host
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DefinitionData {
  word: string
  phonetic?: string
  meanings: Array<{
    partOfSpeech: string
    definitions: Array<{ definition: string; example?: string }>
  }>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PdfOverlay() {
  const [selectedText, setSelectedText] = useState("")
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [showButton, setShowButton] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [definition, setDefinition] = useState<DefinitionData | null>(null)
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(DEFAULT_THEME)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync dark mode themes with PDF.js viewer
  useEffect(() => {
    const isHostedMozillaViewer =
      window.location.hostname === "mozilla.github.io" &&
      window.location.pathname.includes("/pdf.js/web/viewer.html")

    if (!isHostedMozillaViewer) return

    const applyThemeToStorage = (themeId: ThemeId) => {
      try {
        const themeConfig = THEMES[themeId]
        const storageKey = "pdfjs.preferences"
        const existing = window.localStorage.getItem(storageKey)
        const parsed = existing ? JSON.parse(existing) : {}

        const newPrefs = {
          ...parsed,
          viewerCssTheme: themeConfig.isDark ? 2 : 1,
          forcePageColors: true,
          pageColorsBackground: themeConfig.pdfBg,
          pageColorsForeground: themeConfig.pdfFg
        }

        if (
          parsed.viewerCssTheme !== newPrefs.viewerCssTheme ||
          parsed.pageColorsBackground !== newPrefs.pageColorsBackground
        ) {
          window.localStorage.setItem(storageKey, JSON.stringify(newPrefs))
          window.location.reload()
        }
      } catch { }
    }

    const initTheme = async () => {
      const result = await chrome.storage.local.get(["pdfTheme", "pdfDarkTheme"])
      let themeId: ThemeId = DEFAULT_THEME
      if (result.pdfTheme) {
        themeId = result.pdfTheme as ThemeId
      } else if (result.pdfDarkTheme !== undefined) {
        themeId = result.pdfDarkTheme ? "dark-slate" : "light"
      }
      setCurrentTheme(themeId)
      applyThemeToStorage(themeId)
    }
    initTheme()

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.pdfTheme) {
        const newTheme = changes.pdfTheme.newValue as ThemeId
        setCurrentTheme(newTheme)
        applyThemeToStorage(newTheme)
      } else if (changes.pdfDarkTheme && !changes.pdfTheme) {
        const newTheme = changes.pdfDarkTheme.newValue ? "dark-slate" : "light"
        setCurrentTheme(newTheme)
        applyThemeToStorage(newTheme)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  // Fetch definition from APIs
  const fetchDefinition = async (word: string) => {
    setLoading(true)
    setError("")
    setDefinition(null)

    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?1234567890]/g, "").trim()
    if (!cleanWord) {
      setError("No valid word selected")
      setLoading(false)
      return
    }

    const getMwKey = async (): Promise<string> => {
      const res = await chrome.storage.local.get(["mwApiKey"])
      return res.mwApiKey || ""
    }

    const mwKey = await getMwKey()

    if (mwKey) {
      try {
        const res = await fetch(`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(cleanWord)}?key=${mwKey}`)
        if (!res.ok) throw new Error("MW Request Failed")
        const data = await res.json()
        
        // MW returns an array of objects for an exact match, or an array of strings for suggestions
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
          const meaningsMap = new Map<string, any[]>()
          
          data.forEach((entry: any) => {
            const fl = entry.fl || "Definition"
            const defs = entry.shortdef || []
            if (defs.length > 0) {
              if (!meaningsMap.has(fl)) meaningsMap.set(fl, [])
              const existingDefs = meaningsMap.get(fl)!
              defs.forEach((d: string) => {
                existingDefs.push({ definition: d })
              })
            }
          })
          
          if (meaningsMap.size > 0) {
            const meanings = Array.from(meaningsMap.entries()).map(([fl, defs]) => ({
              partOfSpeech: fl,
              definitions: defs
            }))
            
            let phonetic = undefined
            if (data[0].hwi?.prs?.[0]?.mw) {
              phonetic = `\\${data[0].hwi.prs[0].mw}\\`
            }
            
            setDefinition({
              word: cleanWord,
              phonetic,
              meanings
            })
            setLoading(false)
            return
          }
        }
      } catch (e) {
        console.error("MW API Error:", e)
      }
    }

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`)
      if (!res.ok) throw new Error("Not found")
      const data = await res.json()
      if (data?.length > 0) setDefinition(data[0])
      else throw new Error("Empty")
    } catch {
      // Fallback: Wiktionary
      try {
        const res2 = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(cleanWord)}`)
        if (!res2.ok) throw new Error()
        const data2 = await res2.json()
        const en = data2.en
        if (en?.length > 0) {
          setDefinition({
            word: cleanWord,
            meanings: en.map((e: any) => ({
              partOfSpeech: e.partOfSpeech || "Definition",
              definitions: e.definitions
                .map((d: any) => ({
                  definition: d.definition?.replace(/<[^>]*>/g, "").trim() || "",
                  example: d.parsedExamples?.[0]?.example?.replace(/<[^>]*>/g, "").trim()
                }))
                .filter((d: any) => d.definition.length > 0)
            })).filter((m: any) => m.definitions.length > 0)
          })
          return
        }
        setError("Word not found in vocabulary")
      } catch {
        setError("Could not find definition")
      }
    } finally {
      setLoading(false)
    }
  }

  // Lookup handler
  const handleLookup = () => {
    if (selectedText) {
      setShowButton(false)
      setShowCard(true)
      fetchDefinition(selectedText)
    }
  }

  // Event listeners for keyboard/mouse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowCard(false); setShowButton(false); return }

      const active = document.activeElement
      const isTyping =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable)
      if (isTyping) return

      if (e.key.toLowerCase() === "d" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const text = sel.toString().trim()
          if (text) {
            e.preventDefault()
            e.stopPropagation()
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            const cardWidth = 320
            // Use viewport-relative coords (no scrollX/Y) — elements use position:fixed
            let x = rect.left
            if (rect.left + cardWidth > window.innerWidth)
              x = window.innerWidth - cardWidth - 20
            x = Math.max(10, x)
            setPosition({ x, y: Math.min(rect.bottom + 10, window.innerHeight - 350) })
            setSelectedText(text)
            setShowButton(false)
            setShowCard(true)
            fetchDefinition(text)
          }
        }
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      const path = e.composedPath()
      const inside = path.some(n =>
        n instanceof HTMLElement && n.classList.contains("plasmo-dictionary-ignore")
      )
      if (inside) return

      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) { setShowCard(false); setShowButton(false); return }
        const text = sel.toString().trim()
        if (!text) { setShowCard(false); setShowButton(false); return }

        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const cardWidth = 320
        setSelectedText(text)

        // Viewport-relative coords — all floating elements use position:fixed
        if (showCard) {
          let x = rect.left
          if (rect.left + cardWidth > window.innerWidth)
            x = window.innerWidth - cardWidth - 20
          x = Math.max(10, x)
          setPosition({ x, y: Math.min(rect.bottom + 10, window.innerHeight - 350) })
          fetchDefinition(text)
        } else {
          // Trigger button: centered below the selection, with safe bounds
          let x = rect.left + rect.width / 2
          x = Math.max(26, Math.min(x, window.innerWidth - 26))
          const y = Math.min(window.innerHeight - 48, rect.bottom + 12)
          setPosition({ x, y })
          setShowButton(true)
        }
      }, 50)
    }

    document.addEventListener("keydown", handleKeyDown, true)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [showCard, selectedText])

  // Clickable word tokens for multi-word selections
  const renderClickableTokens = (text: string) =>
    text.split(/(\s+|[.,\/#!$%\^&\*;:{}=\-_`~()?]+)/).map((token, idx) => {
      const isWord = /\w+/.test(token)
      if (isWord) {
        return (
          <span
            key={idx}
            onClick={e => { e.stopPropagation(); setSelectedText(token); fetchDefinition(token) }}
            className="plasmo-word-token"
            style={{ cursor: "pointer", padding: "2px 6px", borderRadius: "6px", transition: "all 0.15s ease", display: "inline-block", backgroundColor: "rgba(255,255,255,0.03)" }}>
            {token}
          </span>
        )
      }
      return <span key={idx}>{token}</span>
    })

  const isMultiWord = selectedText.trim().split(/\s+/).length > 1
  const t = THEMES[currentTheme] || THEMES[DEFAULT_THEME]

  return (
    <div ref={containerRef} style={{ display: "contents", pointerEvents: "auto" }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes plasmoFadeIn { from { opacity:0; transform:translateY(4px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(134,239,172,0.4); } 70% { box-shadow: 0 0 0 6px rgba(134,239,172,0); } 100% { box-shadow: 0 0 0 0 rgba(134,239,172,0); } }
        .dictionary-loader { width:18px; height:18px; border:2px solid rgba(255,255,255,0.15); border-radius:50%; border-top-color:#ffffff; animation:spin 0.8s linear infinite; display:inline-block; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .plasmo-word-token:hover { background-color:#ffffff !important; color:#0F172A !important; }
      ` }} />

      {/* 1. Floating trigger button — position:fixed, viewport-relative */}
      {showButton && (
        <button
          className="plasmo-dictionary-ignore"
          onMouseDown={e => e.preventDefault()}
          onClick={handleLookup}
          style={{
            position: "fixed",
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: "translateX(-50%)",
            background: "linear-gradient(135deg, #86EFAC, #66bb8a)",
            border: "1px solid rgba(134,239,172,0.2)",
            color: "#0F172A",
            width: "32px", height: "32px", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 2147483647,
            boxShadow: "0 4px 15px rgba(134,239,172,0.4)",
            animation: "plasmoFadeIn 0.15s cubic-bezier(0.16,1,0.3,1) forwards, pulseGlow 2s infinite",
            padding: "0",
            pointerEvents: "auto"
          }}
          title="Look up definition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      )}

      {/* 2. Dictionary card — position:fixed, viewport-relative */}
      {showCard && (
        <div
          className="plasmo-dictionary-ignore"
          style={{
            position: "fixed",
            left: `${Math.min(position.x, window.innerWidth - 340)}px`,
            top: `${Math.min(position.y, window.innerHeight - 360)}px`,
            background: "rgba(30,41,59,0.96)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#F8FAFC",
            padding: "16px", borderRadius: "16px",
            zIndex: 2147483647, width: "320px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontSize: "13px", lineHeight: "1.5",
            animation: "plasmoFadeIn 0.2s cubic-bezier(0.16,1,0.3,1) forwards",
            pointerEvents: "auto"
          }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
            <div style={{ fontWeight: "800", fontSize: "15px", color: "#F8FAFC", marginRight: "8px", wordBreak: "break-all", letterSpacing: "-0.01em" }}>
              {selectedText}
            </div>
            {definition?.phonetic && (
              <span style={{ fontSize: "10px", fontWeight: "750", color: "#ffffff", backgroundColor: "#334155", padding: "3px 8px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "6px", whiteSpace: "nowrap" }}>
                {definition.phonetic}
              </span>
            )}
          </div>

          {/* States */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#cbd5e1", padding: "8px 0" }}>
              <span className="dictionary-loader" />
              <span>Looking up definition…</span>
            </div>
          )}

          {!loading && isMultiWord && !definition && (
            <div style={{ marginBottom: "12px", background: "rgba(255,255,255,0.02)", padding: "12px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#ffffff", marginBottom: "8px", fontWeight: "700" }}>
                Multiple words selected. Click a word to define:
              </div>
              <div style={{ color: "#F8FAFC", fontSize: "12px", lineHeight: "1.7" }}>
                {renderClickableTokens(selectedText)}
              </div>
            </div>
          )}

          {error && !isMultiWord && (
            <div style={{ color: "#f87171", fontSize: "12px", padding: "4px 0", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {definition && (
            <div style={{ maxHeight: "180px", overflowY: "auto", paddingRight: "4px" }}>
              {definition.meanings.slice(0, 2).map((meaning, i) => (
                <div key={i} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: "850", color: "#ffffff", backgroundColor: "#334155", border: "1px solid rgba(255,255,255,0.3)", padding: "2px 6px", borderRadius: "4px" }}>
                      {meaning.partOfSpeech}
                    </span>
                    <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(255,255,255,0.15)" }} />
                  </div>
                  {meaning.definitions.slice(0, 2).map((def, j) => (
                    <div key={j} style={{ color: "#cbd5e1", fontSize: "12px", marginBottom: "8px", paddingLeft: "4px" }}>
                      <span style={{ color: "#ffffff", marginRight: "6px", fontWeight: "600" }}>{j + 1}.</span>
                      {def.definition}
                      {def.example && (
                        <div style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "11px", marginTop: "3px", borderLeft: "2px solid rgba(255,255,255,0.15)", paddingLeft: "6px" }}>
                          "{def.example}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: "9px", color: "#64748b", display: "flex", justifyContent: "space-between", letterSpacing: "0.02em" }}>
            <span>ESC to close</span>
            <span>D to search</span>
          </div>
        </div>
      )}
    </div>
  )
}
