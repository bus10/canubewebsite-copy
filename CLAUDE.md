# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Can U Be" (@bus0) is a static personal website hosted on GitHub Pages at `https://bus10.github.io/`. It's a brutalist-style playground: a landing page linking to a music player, a podcast teaser, a couple of browser games, a typing test, and an archived "time machine" of old site versions.

There is no build system, package manager, bundler, or backend — every page is a standalone `.html` file with inline or same-directory `<script>`/`<link>` tags, deployed as-is.

## Development Workflow

- **Preview**: open any `.html` file directly in a browser (or serve the directory with any static file server). Changes are reflected immediately — no compile/build step.
- **No tests, no linter, no package.json.** There is nothing to run before committing beyond manually checking the page in a browser.
- **Deployment**: pushing to `main` on GitHub Pages is the deploy mechanism (site root is repo root, per `sitemap.xml`/`robots.txt` referencing `https://bus10.github.io/`).

## Architecture & Conventions

- **Page-per-file**: each route is its own top-level `.html` file (`index.html`, `busify.html`, `snake.html`, `tictactoe.html`, `plinko.html`, `benevolent-inequality.html`, `time-machine.html`, `type speed test/index.html`). New pages should follow the same pattern rather than introducing a router/framework.
- **Shared chrome**: nearly every page includes, in this order:
  1. `<link rel="stylesheet" href="styles.css">` — the one global stylesheet.
  2. A `<button class="theme-toggle" onclick="toggleTheme()">Light</button>` as the first element in `<body>`.
  3. A `.container` (or `.container.center`) div wrapping page content, with an `← Back` link (`class="nav-link"`, `href="index.html"`) and a `.footer` div reading "Website made by @bus0".
  4. `<script src="theme.js"></script>` before any page-specific inline `<script>`.
  - When adding a new page, copy this shell from an existing simple page (e.g. `busify.html`) rather than rebuilding it.
- **Theming**: `theme.js` toggles a `data-theme="light"` attribute on `<body>` and persists the choice in `localStorage` (`theme.js:1`). All color is driven by CSS custom properties defined on `:root` / `[data-theme="light"]` in `styles.css:1` (`--bg-color`, `--text-color`, `--border-color`) — never hardcode colors in page markup; use the existing variables/classes instead.
- **Styling**: `styles.css` is the single source of shared styles (buttons, nav links, game canvas borders, countdown widgets, footer, responsive breakpoint at `600px`, focus-visible outlines). Add new shared component styles here rather than inline `<style>` blocks; page-specific one-off tweaks do appear inline in a few places (e.g. `snake.html` canvas sizing) but shared patterns belong in `styles.css`.
- **Games** (`snake.html`, `tictactoe.html`, `plinko.html`): self-contained vanilla JS in a `<script>` at the bottom of the file, driving a `<canvas id="gameCanvas">`, with `.score`, `.controls`, and `.game-over` elements styled from `styles.css`. No shared game engine/library — each game reimplements its own loop.
- **Archived snapshots**: `time-machine/CUB-V1`, `CUB-V2`, `CUB-V3` are frozen historical copies of the site linked from `time-machine.html`. Do not "fix" or modernize them — they're intentionally preserved as-is.
- **`sitemap.xml`**: manually maintained; add an entry (with `lastmod`) whenever a new public page is added, matching the existing `priority`/`changefreq` conventions (top-level pages weekly/monthly, archived versions `never`).
- **Assets**: images in `images/`, audio in `audio/` (raw `.wav` masters are gitignored — only compressed deliverables like `.mp3` are committed, per `.gitignore`).
