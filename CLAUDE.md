# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Can U Be" (@bus0) is a static personal website hosted on GitHub Pages at `https://bus10.github.io/`. It's a brutalist-style playground: a landing page linking to a music player, a podcast teaser, a couple of browser games, a typing test, and an archived "time machine" of old site versions.

There is no build system, bundler, or backend — every page is a standalone `.html` file sharing `styles.css` and `site.js`, deployed as-is. The only package manifest is the dev-only verification harness in `tools/`.

## Development Workflow

- **Preview**: `node tools/check.mjs --serve` serves the repo root at `http://127.0.0.1:8765/` (any static server works; `python3 -m http.server` cannot bind on this machine). No compile/build step. `404.html` uses root-absolute paths, so it only renders correctly when served from the site root.
- **Verification**: `tools/check.mjs` is a Playwright suite (dev-only; `tools/` has its own `package.json`, the site itself has none). First time: `cd tools && npm install && npx playwright install chromium`. It starts its own local server, so just run `node tools/check.mjs` (all), `node tools/check.mjs shell:snake theme:` (by name prefix), or `node tools/check.mjs --shots` (screenshots of every page at 1280/375 in both themes into gitignored `tools/shots/`). Needs network for Google Fonts.
- **Deployment**: pushing to `main` on GitHub Pages is the deploy mechanism (site root is repo root, per `sitemap.xml`/`robots.txt` referencing `https://bus10.github.io/`).

## Architecture & Conventions

- **Page-per-file**: each route is its own `.html` file (`index.html`, `index1.html`, `benevolent-inequality.html`, `busify.html`, `snake.html`, `plinko.html`, `tictactoe.html`, `type speed test/index.html`, `time-machine.html`, `404.html`). No router/framework.
- **Shared shell** (static markup copied into every page — copy it from `snake.html` when adding a page):
  1. In `<head>`: favicon, the one-line theme snippet `<script>try{if(localStorage.getItem('theme')==='light')...}</script>` (must precede the stylesheets to avoid a theme flash), Google Fonts preconnects + `Anton` / `JetBrains Mono` link, then `styles.css`.
  2. `<header class="topbar">`: home link, `.live-dot`, `<time class="clock">`, `.topbar-back` (inner pages only), `.theme-toggle` calling `toggleTheme()`.
  3. `<main class="page">` (or `.page.page--wide` for full-bleed index layouts) starting with `.page-head` → `h1[data-scramble]` + `.meta` line (`NN / DESCRIPTION`).
  4. `<footer class="ticker marquee">` with the "WEBSITE MADE BY @BUS0" `.marquee-track`.
  5. `<script src="site.js"></script>` before any page script.
- **`site.js`** exposes `toggleTheme()`, `themeColors()` (current `{bg, fg}` for canvas drawing), `setMarqueeText(marqueeEl, text)`, `watchAudio(audioEl, loadingEl)`, and dispatches a `themechange` event on `document`. On load it auto-wires the clock, `.marquee > .marquee-track` loops, `.index-row` hover marquees, `[data-scramble]` headings, a `.motion-toggle` `[PAUSE]` button pinned to the footer ticker (sets `data-motion="paused"` on `<html>`, persisted in `localStorage` key `motion`; stops the ticker, live dot, scramble and row marquees), and `<meta name="theme-color">` from `--bg-color`. Everything decorative is skipped under `prefers-reduced-motion` (no pause button then). Row marquees only *visually* hide `.index-title-text`: it must stay in the accessibility tree as the link's name. Don't put an `aria-label` on `.theme-toggle`; its visible text is its name.
- **Theming**: `data-theme="light"` on `<html>` (dark = no attribute), persisted in `localStorage` key `theme`. Strict black/white: all color comes from `--bg-color` / `--text-color` / `--border-color` in `styles.css`. Never hardcode colors in markup or page scripts — canvases call `themeColors()` and redraw on `themechange` if they don't redraw every frame.
- **Type**: `Anton` for display (h1, index rows, stat values), `JetBrains Mono` for everything else. Body text is uppercase by default; content that must keep its case (e.g. type test words) sets `text-transform: none`.
- **Styling**: `styles.css` is the only stylesheet — tokens, base, shell, components (`.btn`, `.stat-row`/`.stat`, `.index-row`, `.marquee`, `.loading`), then page sections. No inline `<style>` blocks. Motion uses `linear`/`steps()` only; no color transitions (theme switches are hard cuts). Breakpoint `600px`.
- **Games** (`snake.html`, `tictactoe.html`, `plinko.html`): self-contained vanilla JS at the bottom of the file; each reimplements its own loop. Style changes must not alter rules/speeds/scoring.
- **Archived snapshots**: `time-machine/CUB-V1`, `CUB-V2`, `CUB-V3` are frozen, self-contained copies of old versions. Do not "fix" or modernize them.
- **`sitemap.xml`**: manually maintained; add an entry (with `lastmod`) whenever a new public page is added, matching the existing `priority`/`changefreq` conventions (top-level pages weekly/monthly, archived versions `never`).
- **Assets**: images in `images/`, audio in `audio/` (raw `.wav` masters are gitignored — only compressed deliverables like `.mp3` are committed, per `.gitignore`).
