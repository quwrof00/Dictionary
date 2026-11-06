# WordLens

WordLens is a Chromium browser extension built with Plasmo and React. It lets you highlight a word on a webpage, press `D`, or use a floating trigger to open an inline dictionary card without leaving the page. It also includes a PDF reading flow powered by PDF.js, so you can look up words while reading web-hosted or local PDF files.

## Features

- Inline dictionary lookup on regular web pages
- Keyboard shortcut support with `D` for fast lookups
- Floating trigger button after selecting text
- Multi-word selection support with clickable word tokens
- Optional Merriam-Webster Collegiate API integration
- Fallback dictionary lookup using public dictionary sources
- Dedicated PDF viewer flow using bundled PDF.js assets
- Multiple PDF reading themes stored in extension storage

## Tech Stack

- [Plasmo](https://docs.plasmo.com/)
- React 18
- TypeScript

## Requirements

Before running this project on your own device, install:

- Node.js 18 or newer
- `pnpm` recommended, or `npm`
- A Chromium-based browser such as Google Chrome, Microsoft Edge, Brave, or Arc

To install `pnpm` globally:

```bash
npm install -g pnpm
```

## Installation

Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd dictionary
pnpm install
```

If you prefer `npm`:

```bash
npm install
```

## Running Locally

Start the development build:

```bash
pnpm dev
```

Or with `npm`:

```bash
npm run dev
```

Plasmo will generate a browser-specific development build inside the `build` directory.

## Load the Extension in Your Browser

### Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the generated development folder, usually:

```text
build/chrome-mv3-dev
```

### Edge

1. Open `edge://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:

```text
build/chrome-mv3-dev
```

If Plasmo outputs a different browser-specific build folder on your machine, load that folder instead.

## How to Use

### Web pages

1. Open any supported webpage
2. Highlight a word
3. Either:
   - Press `D`, or
   - Click the floating lookup trigger
4. Read the inline definition card
5. Press `Esc` to dismiss the overlay

If you select multiple words, WordLens will show clickable tokens so you can open definitions for individual words.

### PDF reading

WordLens does not inject directly into native browser PDF tabs. Instead, it provides a controlled PDF.js reading surface.

You can use it in two ways:

- Open the extension popup and launch the PDF viewer
- If the active tab is an online PDF, WordLens can pass that remote PDF URL into the viewer

For local PDFs:

- Open the popup
- Launch the PDF viewer
- Choose the PDF manually from your device

This flow is intentional and avoids relying on browser-native PDF tabs as the main reading surface.

## Merriam-Webster API Setup

WordLens works without an API key, but you can improve dictionary results by adding a Merriam-Webster Collegiate API key.

To configure it:

1. Get a key from [dictionaryapi.com](https://dictionaryapi.com/)
2. Open the extension popup
3. Paste the key into the `Dictionary API` field
4. Click `Save`

The key is stored locally using `chrome.storage.local`.

If no key is provided, the extension falls back to public dictionary sources.

## Available Scripts

```bash
pnpm dev
```

Starts the local development build.

```bash
pnpm build
```

Creates a production build.

```bash
pnpm package
```

Packages the extension for distribution.

`npm run dev`, `npm run build`, and `npm run package` are also available.

## Production Build

To create a production bundle:

```bash
pnpm build
```

The output can then be used for manual packaging or browser store submission.

## Permissions Used

The extension currently requests:

- `activeTab`
- `storage`

It also declares scoped host permissions for:

- `https://*.dictionaryapi.com/*`
- `https://api.dictionaryapi.dev/*`
- `https://*.wiktionary.org/*`

These are used so WordLens can:

- Query definitions from Merriam-Webster, Free Dictionary API, and Wiktionary
- Read and apply user preferences and theme settings securely
- Store user settings such as theme and API key
- Work on websites and support local file PDF access where applicable

## Project Structure

```text
.
|-- assets/                Static assets, icon, and bundled PDF.js files
|-- contents/
|   `-- pdf.tsx            Content script and inline dictionary overlay
|-- tabs/
|   `-- pdf-viewer.tsx     Custom PDF viewer tab UI
|-- background.ts          Background entry
|-- popup.tsx              Extension popup UI
|-- theme.ts               Shared theme definitions
|-- package.json
`-- tsconfig.json
```

## Notes and Limitations

- This project is currently designed around Chromium extension APIs
- Native browser PDF tabs are not the primary lookup surface
- Local PDF reading works by selecting the file inside the WordLens PDF viewer
- A Merriam-Webster key is optional, not required
- No automated test suite is currently configured in `package.json`

## Troubleshooting

### The extension does not appear after loading

- Make sure you selected the generated `build/...` folder, not the repo root
- Re-run `pnpm dev` if the build output is missing

### Dictionary lookup does not appear

- Try selecting plain text on a normal webpage first
- Press `D` only when you are not typing inside an input or textarea
- Some browser-internal pages and extension pages are intentionally excluded

### PDF lookup is not working in a native browser PDF tab

- Open the WordLens PDF viewer from the popup instead
- For local PDFs, choose the file manually inside the viewer

### API results look limited

- Add a Merriam-Webster API key in the popup
- Confirm the key was saved successfully

## Development Notes

- Main popup entry: `popup.tsx`
- Main overlay logic: `contents/pdf.tsx`
- PDF viewer tab: `tabs/pdf-viewer.tsx`
- Shared theme configuration: `theme.ts`

If you want to extend the extension, those files are the best starting points.
