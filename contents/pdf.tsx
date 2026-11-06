import { useEffect, useRef, useState, useCallback } from "react"
import type { PlasmoCSConfig, PlasmoGetRootContainer } from "plasmo"
import { THEMES, type ThemeId, DEFAULT_THEME, type ThemeColors } from "../theme"

// Injects dictionary popup on all websites except native PDFs.

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "file://*/*.pdf",
    "file://*/*.PDF"
  ]
}

// ─── Constants & Pre-compiled Expressions (Constant Folding & Code Motion) ───

const HOST_ID = "wordlens-csui-host"
const HOST_STYLE = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;overflow:visible;"

const CARD_WIDTH = 320
const CARD_MAX_HEIGHT = 350
const CARD_OFFSET_Y = 10
const BUTTON_OFFSET_Y = 12
const BUTTON_SAFE_PADDING = 26
const EDGE_PADDING = 10

const STORAGE_PREFS_KEY = "pdfjs.preferences"
const MOZILLA_HOST = "mozilla.github.io"
const MOZILLA_VIEWER_PATH = "/pdf.js/web/viewer.html"

const MW_API_BASE = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/"
const FREE_DICT_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/"
const WIKTIONARY_BASE = "https://en.wiktionary.org/api/rest_v1/page/definition/"

const CLEAN_WORD_REGEX = /[.,\/#!$%\^&\*;:{}=\-_`~()?\d]/g
const WORD_TOKEN_REGEX = /\w+/
const TOKEN_SPLIT_REGEX = /(\s+|[.,\/#!$%\^&\*;:{}=\-_`~()?]+)/
const WHITESPACE_REGEX = /\s+/
const TAG_STRIP_REGEX = /<[^>]*>/g
const PDF_EXT_REGEX = /\.pdf($|[?#])/i

const CSS_STYLES = `
@keyframes plasmoFadeIn { from { opacity:0; transform:translateY(4px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(134,239,172,0.4); } 70% { box-shadow: 0 0 0 6px rgba(134,239,172,0); } 100% { box-shadow: 0 0 0 0 rgba(134,239,172,0); } }
@keyframes spin { to { transform:rotate(360deg); } }
.dictionary-loader { width:18px; height:18px; border:2px solid rgba(255,255,255,0.15); border-radius:50%; border-top-color:#ffffff; animation:spin 0.8s linear infinite; display:inline-block; }
.plasmo-word-token { cursor:pointer; padding:2px 6px; border-radius:6px; transition:all 0.15s ease; display:inline-block; background-color:rgba(255,255,255,0.03); }
.plasmo-word-token:hover { background-color:#ffffff !important; color:#0F172A !important; }
`

const CONTAINER_STYLE: React.CSSProperties = { display: "contents", pointerEvents: "auto" }

// ─── Pure Geometry & Positioning Helpers ─────────────────────────────────────

function calculateCardPosition(rect: DOMRect, winWidth: number, winHeight: number): { x: number; y: number } {
  let x = rect.left
  if (x + CARD_WIDTH > winWidth) {
    x = winWidth - CARD_WIDTH - 20
  }
  return {
    x: Math.max(EDGE_PADDING, x),
    y: Math.min(rect.bottom + CARD_OFFSET_Y, winHeight - CARD_MAX_HEIGHT)
  }
}

function calculateButtonPosition(rect: DOMRect, winWidth: number, winHeight: number): { x: number; y: number } {
  const centerX = rect.left + rect.width * 0.5
  return {
    x: Math.max(BUTTON_SAFE_PADDING, Math.min(centerX, winWidth - BUTTON_SAFE_PADDING)),
    y: Math.min(winHeight - 48, rect.bottom + BUTTON_OFFSET_Y)
  }
}

function isHostedMozillaViewer(loc: Location = window.location): boolean {
  return loc.hostname === MOZILLA_HOST && loc.pathname.includes(MOZILLA_VIEWER_PATH)
}

export const getRootContainer: PlasmoGetRootContainer = () => {
  if (typeof document === "undefined" || !document.documentElement) return null

  // Skip raw PDF tabs — they have no standard HTML body
  const isMozilla = isHostedMozillaViewer()
  const href = window.location.href
  const isNativePdf =
    document.contentType === "application/pdf" ||
    PDF_EXT_REGEX.test(window.location.pathname) ||
    PDF_EXT_REGEX.test(href)

  if (isNativePdf && !isMozilla) return null

  // Skip our own extension pages
  const protocol = window.location.protocol
  if (protocol === "chrome-extension:" || protocol === "edge-extension:") return null

  // Create a transparent container for the Plasmo Shadow DOM UI
  const existing = document.getElementById(HOST_ID)
  if (existing) return existing

  const host = document.createElement("div")
  host.id = HOST_ID
  host.style.cssText = HOST_STYLE
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

  // Mutable refs to prevent re-binding document listeners on every render
  const showCardRef = useRef(showCard)
  showCardRef.current = showCard
  const selectedTextRef = useRef(selectedText)
  selectedTextRef.current = selectedText

  // Sync dark mode themes with PDF.js viewer
  useEffect(() => {
    if (!isHostedMozillaViewer()) return

    const applyThemeToStorage = (themeId: ThemeId) => {
      try {
        const themeConfig = THEMES[themeId] || THEMES[DEFAULT_THEME]
        const existing = window.localStorage.getItem(STORAGE_PREFS_KEY)
        const parsed = existing ? JSON.parse(existing) : {}

        const newViewerCssTheme = themeConfig.isDark ? 2 : 1
        if (
          parsed.viewerCssTheme !== newViewerCssTheme ||
          parsed.pageColorsBackground !== themeConfig.pdfBg
        ) {
          const newPrefs = {
            ...parsed,
            viewerCssTheme: newViewerCssTheme,
            forcePageColors: true,
            pageColorsBackground: themeConfig.pdfBg,
            pageColorsForeground: themeConfig.pdfFg
          }
          window.localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(newPrefs))
          window.location.reload()
        }
      } catch { }
    }

    const initTheme = async () => {
      const result = await chrome.storage.local.get(["pdfTheme", "pdfDarkTheme"])
      const themeId: ThemeId = (result.pdfTheme as ThemeId) ||
        (result.pdfDarkTheme !== undefined ? (result.pdfDarkTheme ? "dark-slate" : "light") : DEFAULT_THEME)
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

  // Fetch definition from APIs with loop-optimized parser and CSE
  const fetchDefinition = useCallback(async (word: string) => {
    setLoading(true)
    setError("")
    setDefinition(null)

    const cleanWord = word.replace(CLEAN_WORD_REGEX, "").trim()
    if (!cleanWord) {
      setError("No valid word selected")
      setLoading(false)
      return
    }

    const storageRes = await chrome.storage.local.get(["mwApiKey"])
    const mwKey: string = storageRes.mwApiKey || ""
    const encodedWord = encodeURIComponent(cleanWord)

    if (mwKey) {
      try {
        const res = await fetch(`${MW_API_BASE}${encodedWord}?key=${mwKey}`)
        if (!res.ok) throw new Error("MW Request Failed")
        const data = await res.json()

        // MW returns an array of objects for an exact match
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
          const meaningsMap = new Map<string, Array<{ definition: string }>>()
          
          for (let i = 0, len = data.length; i < len; i++) {
            const entry = data[i]
            const defs = entry.shortdef
            if (!defs || defs.length === 0) continue

            const fl = entry.fl || "Definition"
            let existingDefs = meaningsMap.get(fl)
            if (!existingDefs) {
              existingDefs = []
              meaningsMap.set(fl, existingDefs)
            }
            for (let j = 0, dLen = defs.length; j < dLen; j++) {
              existingDefs.push({ definition: defs[j] })
            }
          }

          if (meaningsMap.size > 0) {
            const meanings = Array.from(meaningsMap.entries()).map(([fl, defs]) => ({
              partOfSpeech: fl,
              definitions: defs
            }))

            let phonetic: string | undefined = undefined
            const firstPr = data[0].hwi?.prs?.[0]?.mw
            if (firstPr) {
              phonetic = `\\${firstPr}\\`
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
      const res = await fetch(`${FREE_DICT_BASE}${encodedWord}`)
      if (!res.ok) throw new Error("Not found")
      const data = await res.json()
      if (data?.length > 0) {
        setDefinition(data[0])
        setLoading(false)
        return
      }
      throw new Error("Empty")
    } catch {
      // Fallback: Wiktionary
      try {
        const res2 = await fetch(`${WIKTIONARY_BASE}${encodedWord}`)
        if (!res2.ok) throw new Error()
        const data2 = await res2.json()
        const en = data2.en
        const enLen = en ? en.length : 0
        if (enLen > 0) {
          const meanings = []
          for (let i = 0; i < enLen; i++) {
            const item = en[i]
            const rawDefs = item.definitions
            const defsLen = rawDefs ? rawDefs.length : 0
            const definitions = []
            for (let j = 0; j < defsLen; j++) {
              const d = rawDefs[j]
              const defText = d.definition ? d.definition.replace(TAG_STRIP_REGEX, "").trim() : ""
              if (defText) {
                const ex = d.parsedExamples?.[0]?.example
                definitions.push({
                  definition: defText,
                  example: ex ? ex.replace(TAG_STRIP_REGEX, "").trim() : undefined
                })
              }
            }
            if (definitions.length > 0) {
              meanings.push({
                partOfSpeech: item.partOfSpeech || "Definition",
                definitions
              })
            }
          }

          if (meanings.length > 0) {
            setDefinition({
              word: cleanWord,
              meanings
            })
            setLoading(false)
            return
          }
        }
        setError("Word not found in vocabulary")
      } catch {
        setError("Could not find definition")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDefRef = useRef(fetchDefinition)
  fetchDefRef.current = fetchDefinition

  // Lookup handler
  const handleLookup = useCallback(() => {
    const text = selectedTextRef.current
    if (text) {
      setShowButton(false)
      setShowCard(true)
      fetchDefRef.current(text)
    }
  }, [])

  // Event listeners bound once; uses refs to avoid memory & listener churn
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCard(false)
        setShowButton(false)
        return
      }

      const active = document.activeElement
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable)
      ) return

      if (e.key.toLowerCase() === "d" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const text = sel.toString().trim()
          if (text) {
            e.preventDefault()
            e.stopPropagation()
            const rect = sel.getRangeAt(0).getBoundingClientRect()
            setPosition(calculateCardPosition(rect, window.innerWidth, window.innerHeight))
            setSelectedText(text)
            setShowButton(false)
            setShowCard(true)
            fetchDefRef.current(text)
          }
        }
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      const path = e.composedPath()
      for (let i = 0, pLen = path.length; i < pLen; i++) {
        const node = path[i]
        if (node instanceof HTMLElement && node.classList.contains("plasmo-dictionary-ignore")) {
          return
        }
      }

      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) {
          setShowCard(false)
          setShowButton(false)
          return
        }
        const text = sel.toString().trim()
        if (!text) {
          setShowCard(false)
          setShowButton(false)
          return
        }

        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        setSelectedText(text)

        const winW = window.innerWidth
        const winH = window.innerHeight

        if (showCardRef.current) {
          setPosition(calculateCardPosition(rect, winW, winH))
          fetchDefRef.current(text)
        } else {
          setPosition(calculateButtonPosition(rect, winW, winH))
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
  }, [])

  // Clickable word tokens for multi-word selections
  const renderClickableTokens = (text: string) => {
    const tokens = text.split(TOKEN_SPLIT_REGEX)
    const elements = []
    for (let idx = 0, len = tokens.length; idx < len; idx++) {
      const token = tokens[idx]
      if (WORD_TOKEN_REGEX.test(token)) {
        elements.push(
          <span
            key={idx}
            onClick={e => {
              e.stopPropagation()
              setSelectedText(token)
              fetchDefinition(token)
            }}
            className="plasmo-word-token">
            {token}
          </span>
        )
      } else {
        elements.push(<span key={idx}>{token}</span>)
      }
    }
    return elements
  }

  const isMultiWord = selectedText.trim().split(WHITESPACE_REGEX).length > 1

  return (
    <div style={CONTAINER_STYLE}>
      <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />

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
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 2147483647,
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
            padding: "16px",
            borderRadius: "16px",
            zIndex: 2147483647,
            width: "320px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: "13px",
            lineHeight: "1.5",
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
