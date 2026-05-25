import { useEffect, useState } from "react"
import { THEMES, type ThemeId, DEFAULT_THEME } from "./theme"

function IndexPopup() {
  const [activeTabUrl, setActiveTabUrl] = useState("")
  const [pdfError, setPdfError] = useState("")
  const [mwApiKey, setMwApiKey] = useState("")
  const [apiSaveStatus, setApiSaveStatus] = useState("")
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(DEFAULT_THEME)

  // Fetch user settings from Chrome storage when popup opens
  useEffect(() => {
    const fetchSettings = async () => {
      const result = await chrome.storage.local.get(["pdfTheme", "mwApiKey", "pdfDarkTheme"])
      // Migrate old pdfDarkTheme if it exists
      if (result.pdfTheme) {
        setCurrentTheme(result.pdfTheme as ThemeId)
      } else if (result.pdfDarkTheme !== undefined) {
        const migrated = result.pdfDarkTheme ? "dark-slate" : "light"
        setCurrentTheme(migrated)
        await chrome.storage.local.set({ pdfTheme: migrated })
      }

      if (result.mwApiKey !== undefined) {
        setMwApiKey(result.mwApiKey)
      }
    }
    fetchSettings()
  }, [])

  // Save the Merriam-Webster API key to Chrome storage
  const handleSaveApiKey = async () => {
    await chrome.storage.local.set({ mwApiKey })
    setApiSaveStatus("Saved!")
    setTimeout(() => setApiSaveStatus(""), 2000)
  }

  // Update theme in Chrome storage and directly inside PDF.js local storage
  const handleThemeChange = (newThemeId: ThemeId) => {
    setCurrentTheme(newThemeId)
    chrome.storage.local.set({ pdfTheme: newThemeId })
    try {
      const themeConfig = THEMES[newThemeId]
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
    } catch { }
  }

  // Get the URL of the user's currently active browser tab
  useEffect(() => {
    const fetchActiveTab = async () => {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tabs && tabs[0]?.url) {
          setActiveTabUrl(tabs[0].url)
        }
      }
    }
    fetchActiveTab()
  }, [])

  const getPdfFilename = (url: string) => {
    try {
      const decodedUrl = decodeURIComponent(url)
      const parts = decodedUrl.split("/")
      const lastPart = parts[parts.length - 1]
      return lastPart.split("?")[0] || "document.pdf"
    } catch {
      return "document.pdf"
    }
  }

  const isPdf =
    activeTabUrl.toLowerCase().endsWith(".pdf") ||
    activeTabUrl.toLowerCase().includes(".pdf?") ||
    activeTabUrl.toLowerCase().includes("/pdf")
  const isLocalPdf = activeTabUrl.toLowerCase().startsWith("file://")
  const pdfFilename = isPdf ? getPdfFilename(activeTabUrl) : ""

  // Extract the true PDF URL if it is nested inside another viewer's URL
  const resolveRemotePdfUrl = (url: string) => {
    if (!url) return ""

    try {
      const parsed = new URL(url)
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        if (
          parsed.pathname.toLowerCase().endsWith(".pdf") ||
          parsed.pathname.toLowerCase().includes("/pdf")
        ) {
          return parsed.toString()
        }
      }

      for (const key of ["file", "src", "url"]) {
        const nested = parsed.searchParams.get(key)
        if (!nested) continue

        try {
          const nestedUrl = new URL(decodeURIComponent(nested))
          if (nestedUrl.protocol === "http:" || nestedUrl.protocol === "https:") {
            return nestedUrl.toString()
          }
        } catch {
          continue
        }
      }
    } catch {
      return ""
    }

    return ""
  }

  const getHostedMozillaViewerUrl = (source?: string) => {
    const viewerUrl = "https://mozilla.github.io/pdf.js/web/viewer.html"
    return source ? `${viewerUrl}?file=${encodeURIComponent(source)}` : viewerUrl
  }

  const handleOpenPdfReader = async () => {
    try {
      if (isLocalPdf) {
        chrome.tabs.create({ url: getHostedMozillaViewerUrl() })
        return
      }

      if (isPdf) {
        const source = resolveRemotePdfUrl(activeTabUrl)
        if (!source) {
          setPdfError("Could not resolve the remote PDF URL from this browser tab.")
          setTimeout(() => setPdfError(""), 2200)
          return
        }

        chrome.tabs.create({ url: getHostedMozillaViewerUrl(source) })
        return
      }

      chrome.tabs.create({ url: getHostedMozillaViewerUrl() })
    } catch {
      setPdfError("Failed to open the PDF viewer.")
      setTimeout(() => setPdfError(""), 2200)
    }
  }

  return (
    <div
      style={{
        width: "320px",
        padding: "20px",
        background: "#111111",
        color: "#F5F5F5",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px"
      }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
            .wordlens-btn {
              transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .wordlens-btn:hover {
              background: #e5e5e5 !important;
              color: #111111 !important;
              box-shadow: 0 4px 16px rgba(255,255,255,0.16) !important;
              transform: translateY(-1px);
            }
            .wordlens-btn:active {
              transform: translateY(0);
            }
          `
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#86EFAC"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: "800",
              color: "#F5F5F5",
              letterSpacing: "0.08em",
              textTransform: "uppercase"
            }}>
            WordLens
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "10px",
              color: "#86EFAC",
              fontWeight: "600",
              letterSpacing: "0.02em"
            }}>
            Read without breaking focus.
          </p>
        </div>
      </div>

      <div
        style={{
          height: "1px",
          backgroundColor: "rgba(255,255,255,0.08)",
          marginBottom: "16px"
        }}
      />

      <div style={{ marginBottom: "20px" }}>
        <h3
          style={{
            fontSize: "10px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#a3a3a3",
            margin: "0 0 10px 0"
          }}>
          Usage Shortcuts
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11px", color: "#d4d4d4" }}>
            <span style={{ color: "#86EFAC", fontWeight: "600" }}>•</span>
            <span>Highlight any word on a webpage to show the quick trigger.</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11px", color: "#d4d4d4" }}>
            <span style={{ color: "#86EFAC", fontWeight: "600" }}>•</span>
            <span>
              Press{" "}
              <strong
                style={{
                  color: "#f5f5f5",
                  background: "#1f1f1f",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontWeight: "600"
                }}>
                D
              </strong>{" "}
              to open definitions instantly.
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11px", color: "#d4d4d4" }}>
            <span style={{ color: "#86EFAC", fontWeight: "600" }}>•</span>
            <span>For phrases, click any individual word to look it up in place.</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "14px",
          borderRadius: "12px",
          marginBottom: "16px"
        }}>
        <h4
          style={{
            margin: "0 0 6px 0",
            fontSize: "12px",
            fontWeight: "700",
            color: "#F5F5F5",
            letterSpacing: "0.02em"
          }}>
          Dictionary API
        </h4>
        <p style={{ margin: "0 0 10px 0", fontSize: "11px", color: "#d4d4d4", lineHeight: "1.4" }}>
          Enhance definitions using the <a href="https://dictionaryapi.com/" target="_blank" rel="noreferrer" style={{ color: "#86EFAC", textDecoration: "none" }}>Merriam-Webster Collegiate API</a>. Enter your free key below.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="password"
            value={mwApiKey}
            onChange={(e) => setMwApiKey(e.target.value)}
            placeholder="Paste API Key here..."
            style={{
              flex: 1,
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              borderRadius: "8px",
              padding: "8px 10px",
              fontSize: "11px",
              outline: "none"
            }}
          />
          <button
            onClick={handleSaveApiKey}
            className="wordlens-btn"
            style={{
              background: "#262626",
              color: "#f5f5f5",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer"
            }}>
            {apiSaveStatus || "Save"}
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "14px",
          borderRadius: "12px"
        }}>
        <h4
          style={{
            margin: "0 0 6px 0",
            fontSize: "12px",
            fontWeight: "700",
            color: "#F5F5F5",
            letterSpacing: "0.02em"
          }}>
          PDF.js Viewer
        </h4>

        {isPdf ? (
          <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ margin: 0, fontSize: "11px", color: "#d4d4d4", lineHeight: "1.4" }}>
              {isLocalPdf
                ? "Active local PDF detected. The Mozilla viewer will open blank so you can pick the saved PDF there."
                : "Active browser PDF detected. Click below to open its resolved remote PDF directly in the Mozilla GitHub PDF.js viewer."}
            </p>
            <div
              style={{
                fontSize: "10px",
                color: "#f5f5f5",
                background: "#262626",
                padding: "6px 10px",
                borderLeft: "2px solid #737373",
                borderRadius: "6px",
                wordBreak: "break-all",
                fontFamily: "monospace"
              }}>
              {pdfFilename}
            </div>
            <p style={{ margin: 0, fontSize: "10px", color: "#a3a3a3", lineHeight: "1.4" }}>
              Local file PDFs open a blank Mozilla viewer. Online PDFs are passed to the same Mozilla GitHub PDF.js flow so meanings behave consistently.
            </p>
          </div>
        ) : (
          <p style={{ margin: "0 0 12px 0", fontSize: "11px", color: "#d4d4d4", lineHeight: "1.4" }}>
            Open the PDF viewer directly, then choose any local PDF manually from inside the extension-controlled viewer.
          </p>
        )}

        {pdfError && (
          <div
            style={{
              fontSize: "10px",
              color: "#f87171",
              background: "rgba(248, 113, 113, 0.08)",
              padding: "8px",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              borderRadius: "6px",
              marginBottom: "10px",
              lineHeight: "1.3"
            }}>
            {pdfError}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#d4d4d4" }}>
            Viewer Theme
          </div>
          <select
            value={currentTheme}
            onChange={(e) => handleThemeChange(e.target.value as ThemeId)}
            style={{
              background: "#262626",
              color: "#f5f5f5",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "10px",
              fontWeight: "700",
              cursor: "pointer",
              outline: "none"
            }}>
            {Object.values(THEMES).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <button
          className="wordlens-btn"
          onClick={handleOpenPdfReader}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #f5f5f5 0%, #bdbdbd 100%)",
            color: "#111111",
            border: "none",
            padding: "10px 12px",
            fontSize: "11px",
            fontWeight: "800",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            borderRadius: "8px"
          }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {isPdf ? "Open Active PDF In PDF.js" : "Open PDF Viewer"}
        </button>
      </div>

      <div
        style={{
          marginTop: "16px",
          textAlign: "center",
          fontSize: "9px",
          color: "#737373",
          letterSpacing: "0.02em"
        }}>
        Press <strong style={{ color: "#f5f5f5" }}>Esc</strong> to dismiss active dictionary overlays.
      </div>
    </div>
  )
}

export default IndexPopup
