# MangaCentral (Chrome extension)

Manifest V3 extension: reading tracker, overlay tools, search (MangaDex / Jikan / AniList), optional Gemini translation.

## Build the content script

```bash
npm install
npm run build:content
```

This generates `content/core.bundle.js` from `content/core.js` and related modules.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this project folder

## Store / privacy

See `docs/privacy-policy.html` (host for Chrome Web Store) and `docs/chrome-store-notes.txt`.

More detail (French): [README_FR.md](README_FR.md).
