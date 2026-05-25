import { useEffect, useMemo, useRef, useState } from "react"
import { THEMES, type ThemeId, DEFAULT_THEME } from "../theme"

// Syncs the chosen theme into PDF.js local storage so the iframe uses it
function setMozillaViewerTheme(themeId: ThemeId) {
  try {
    const themeConfig = THEMES[themeId]
    const storageKey = "pdfjs.preferences"
    const existing = localStorage.getItem(storageKey)
    const parsed = existing ? JSON.parse(existing) : {}

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...parsed,
        viewerCssTheme: themeConfig.isDark ? 2 : 1,
        forcePageColors: true,
        pageColorsBackground: themeConfig.pdfBg,
        pageColorsForeground: themeConfig.pdfFg
      })
    )
  } catch {
    // Ignore preference storage failures; the viewer can still open.
  }
}

export default function PdfViewerTab() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const initialSource = params.get("source") || params.get("file") || ""
  const [viewerSrc, setViewerSrc] = useState("")
  const [error, setError] = useState("")
  const [status, setStatus] = useState(initialSource ? "Preparing PDF.js viewer..." : "")
  const [urlInput, setUrlInput] = useState(
    initialSource.toLowerCase().startsWith("http") ? initialSource : ""
  )
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(DEFAULT_THEME)

  useEffect(() => {
    const fetchTheme = async () => {
      const result = await chrome.storage.local.get(["pdfTheme", "pdfDarkTheme"])
      if (result.pdfTheme) {
        setCurrentTheme(result.pdfTheme as ThemeId)
      } else if (result.pdfDarkTheme !== undefined) {
        setCurrentTheme(result.pdfDarkTheme ? "dark-slate" : "light")
      }
    }
    fetchTheme()
  }, [])
  const objectUrlRef = useRef("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const viewerBase = chrome.runtime.getURL("assets/pdfjs/web/viewer.html")

  const cleanupObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ""
    }
  }

  // Opens a remote URL in the PDF.js iframe
  const openViewerWithUrl = (url: string) => {
    cleanupObjectUrl()
    setMozillaViewerTheme(currentTheme)
    setError("")
    setStatus("")
    setViewerSrc(`${viewerBase}?file=${encodeURIComponent(url)}`)
  }

  // Loads a local PDF file into the PDF.js iframe using an object URL
  const openViewerWithFile = (file: File) => {
    cleanupObjectUrl()
    setViewerSrc("")
    setError("")
    setStatus(`Opening ${file.name}...`)

    try {
      const objectUrl = URL.createObjectURL(file)
      objectUrlRef.current = objectUrl
      setMozillaViewerTheme(currentTheme)
      setViewerSrc(`${viewerBase}?file=${encodeURIComponent(objectUrl)}`)
      setStatus("")
    } catch {
      setStatus("")
      setError("Failed to open the selected PDF file.")
    }
  }

  useEffect(() => {
    cleanupObjectUrl()
    setViewerSrc("")
    setError("")

    if (!initialSource) {
      setStatus("")
      return
    }

    if (initialSource.toLowerCase().startsWith("http://") || initialSource.toLowerCase().startsWith("https://")) {
      setStatus("Opening active web PDF...")
      openViewerWithUrl(initialSource)
      return
    }

    setStatus("")
    setError(
      "Local browser PDF tabs are not used as a deployment path. Choose the PDF manually below to open it in the extension-controlled viewer."
    )

    return () => {
      cleanupObjectUrl()
    }
  }, [initialSource])

  useEffect(() => {
    return () => {
      cleanupObjectUrl()
    }
  }, [])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        background: "#0f172a",
        color: "#f8fafc",
        fontFamily: "'Inter', system-ui, sans-serif"
      }}>
      <style>{`
        html, body, #__plasmo {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: #0f172a;
        }
        .pdf-viewer-btn {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .pdf-viewer-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(255, 255, 255, 0.28);
        }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            openViewerWithFile(file)
          }
        }}
        style={{ display: "none" }}
      />

      {!viewerSrc && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box"
          }}>
          <div
            style={{
              width: "min(560px, 100%)",
              background: "rgba(30, 41, 59, 0.92)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              borderRadius: "18px",
              padding: "28px",
              boxShadow: "0 24px 56px rgba(0, 0, 0, 0.45)"
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#86EFAC"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div style={{ fontSize: "18px", fontWeight: 800 }}>WordLens PDF Viewer</div>
            </div>

            <div style={{ fontSize: "13px", lineHeight: "1.6", color: "#cbd5e1", marginBottom: "18px" }}>
              This is the deployment-safe PDF surface for WordLens. Open web PDFs by URL or choose local PDFs directly from your device.
            </div>

            {status && (
              <div style={{ marginBottom: "14px", fontSize: "13px", color: "#cbd5e1" }}>
                {status}
              </div>
            )}

            {error && (
              <div
                style={{
                  marginBottom: "14px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(248, 113, 113, 0.24)",
                  background: "rgba(248, 113, 113, 0.08)",
                  color: "#fca5a5",
                  fontSize: "13px",
                  lineHeight: "1.5"
                }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "8px" }}>
                Open Web PDF
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="https://example.com/document.pdf"
                  style={{
                    flex: "1 1 320px",
                    minWidth: "240px",
                    background: "#0f172a",
                    color: "#f8fafc",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
                <button
                  className="pdf-viewer-btn"
                  onClick={() => {
                    const trimmed = urlInput.trim()
                    if (!trimmed) {
                      setError("Enter a web PDF URL first.")
                      return
                    }
                    if (!/^https?:\/\//i.test(trimmed)) {
                      setError("Use an http:// or https:// PDF URL.")
                      return
                    }
                    setStatus("Opening web PDF...")
                    openViewerWithUrl(trimmed)
                  }}
                  style={{
                    background: "transparent",
                    color: "#f8fafc",
                    border: "1px solid rgba(255, 255, 255, 0.22)",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    cursor: "pointer"
                  }}>
                  Open URL
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "8px" }}>
                Open Local PDF
              </div>
              <button
                className="pdf-viewer-btn"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: "pointer"
                }}>
                Choose PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The actual PDF.js Mozilla Viewer embedded as an iframe */}
      {viewerSrc && (
        <div style={{ position: "absolute", inset: 0 }}>
          <iframe
            src={viewerSrc}
            title="Mozilla PDF Viewer"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block"
            }}
          />
        </div>
      )}

      {/* Global Theme Dropdown Button */}
      <select
        value={currentTheme}
        onChange={(e) => {
          const newTheme = e.target.value as ThemeId;
          setCurrentTheme(newTheme);
          chrome.storage.local.set({ pdfTheme: newTheme });
          setMozillaViewerTheme(newTheme);
          if (viewerSrc) {
            const currentSrc = viewerSrc;
            setViewerSrc("");
            setTimeout(() => setViewerSrc(currentSrc), 50);
          }
        }}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          background: THEMES[currentTheme].isDark ? "#f8fafc" : "#0f172a",
          color: THEMES[currentTheme].isDark ? "#0f172a" : "#f8fafc",
          border: "none",
          padding: "10px 18px",
          borderRadius: "12px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "13px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          outline: "none",
          transition: "all 0.2s ease"
        }}
      >
        {Object.values(THEMES).map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  )
}
