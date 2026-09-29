# Can U Be — Site Redesign

**Date:** 2026-09-28
**Status:** Approved in brainstorming, pending spec review
**Baseline commit:** `12364c0`

## Goal

The site is brutalist but feels dead. Keep the brutalist DNA and make it feel alive through **huge type, motion, and interactivity** — without adding color, a build step, or a framework.

## Keep (non-negotiable)

- Strict black/white only (`#000` / `#fff`). No accent color.
- Uppercase everywhere, square corners, hard rules, invert-on-hover.
- Dark theme default; light/dark toggle persisted in `localStorage` under key `theme`.
- Name "CAN U BE" and the "Website made by @bus0" credit.
- Static, page-per-file, no build step, deploys to GitHub Pages as-is.
- `time-machine/CUB-V1..V3` are not touched.
- All game logic, rules, speeds, scoring, the Benevolent Inequality day-of-week rotation, and the type test's word/scoring logic are unchanged.

## Out of scope

- Custom audio player (native `<audio>` stays).
- New pages, new games, reorganizing site sections.
- Any change to the time-machine archives.

## Architecture (Approach A)

Shared chrome is **static markup duplicated in every page** (works without JS). One global stylesheet, one global behavior script.

| File | Change |
|---|---|
| `styles.css` | Rewritten: tokens, base, shell, components, page-specific sections (incl. former tic-tac-toe inline styles, type test styles, 404 styles). |
| `site.js` | New. Replaces `theme.js`. |
| `theme.js` | Deleted. |
| `type speed test/styles.css` | Deleted; useful rules folded into `styles.css`. |
| Every live `.html` page | New shell markup, font links, head theme snippet, `site.js`. |
| `sitemap.xml` | `lastmod` bumped to redesign date for changed pages. |
| `CLAUDE.md` | Updated to describe new shell, `site.js`, fonts, `themechange`. |

Live pages: `index.html`, `index1.html`, `benevolent-inequality.html`, `busify.html`, `snake.html`, `plinko.html`, `tictactoe.html`, `type speed test/index.html`, `time-machine.html`, `404.html`.

## 1. Tokens, type, theme

**Fonts** (Google Fonts, `preconnect` + `display=swap`):
- **Anton** — display: landing title, page `h1`, index rows, countdown digits, stat values, tic-tac-toe marks. Uppercase, `letter-spacing: -0.01em`.
- **JetBrains Mono** (400, 700) — utility: top bar, clock, labels, meta lines, nav, controls, buttons, body copy, footer ticker, canvas text. Uppercase, `letter-spacing: 0.08em`. Sizes 11 / 13 / 15px.

**Scale:**
- `--size-hero: clamp(72px, 22vw, 360px)` (landing title, 404)
- `--size-h1: clamp(56px, 14vw, 200px)`
- `--size-row: clamp(36px, 8vw, 104px)`
- `--size-stat: clamp(40px, 9vw, 120px)`

**Tokens** (existing names kept for compatibility):
```css
:root { --bg-color:#000; --text-color:#fff; --border-color:#fff; --muted:0.55; --rule:2px; }
[data-theme="light"] { --bg-color:#fff; --text-color:#000; --border-color:#000; }
```
Spacing scale 4 / 8 / 16 / 24 / 48 / 96px. Breakpoint 600px.

**Layout:** rules are full-bleed (edge to edge). Landing is full width. Inner page content max-width 1100px, centered; top bar and ticker remain full-bleed.

**Theme application:** `data-theme="light"` lives on `<html>` (not `<body>`). Each page's `<head>` includes, before the stylesheet:
```html
<script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
```
Theme switches are instant (no color transitions).

**Motion rule:** all animation uses `linear` or `steps()` — no easing curves. Everything decorative respects `prefers-reduced-motion: reduce`.

## 2. Components & motion

### Shell markup (every page)

```html
<header class="topbar">
  <a href="index.html" class="topbar-home">CAN U BE</a>
  <span class="live-dot" aria-hidden="true">●</span>
  <time class="clock" aria-label="Current time">00:00:00</time>
  <a href="index.html" class="topbar-back">← INDEX</a>   <!-- inner pages only -->
  <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
</header>
<main class="page">…</main>
<footer class="ticker marquee" aria-label="Website made by @bus0">
  <div class="marquee-track"><span>WEBSITE MADE BY @BUS0 · CAN U BE · </span></div>
</footer>
```
(Paths prefixed with `../` inside `type speed test/`.)

- **Top bar:** sticky, mono 11px, 2px bottom rule. Live dot blinks via `steps(1)` 1s. Toggle label shows the theme you'd switch *to*: `[LIGHT]` in dark mode, `[DARK]` in light mode.
- **Page head** (`.page-head`): `h1` (Anton, `--size-h1`, `data-scramble`) + `.meta` mono line, e.g. `04 / SNAKE — ARROW KEYS TO MOVE`.
- **Ticker footer:** full-bleed marquee, 2px top rule.

### Components (`styles.css`)

- **`.index-row`** (`<a>`): grid of mono number · Anton title (`--size-row`) · `↗`; 2px rule between rows. On `:hover` / `:focus-visible`: instant invert, title becomes a scrolling marquee (title text duplicated by `site.js` into a `.marquee-track`). No hover on touch — tap simply navigates.
- **`.btn`**: mono 13px, 2px border, transparent bg. Hover: invert. `:active`: `transform: translate(2px,2px)`. `.btn.is-active`: stays inverted. Replaces `.game-button`, `.length-btn`, `.reset-btn`, `.reset-button`.
- **`.stat-row` / `.stat`**: grid of bordered cells with collapsed shared borders; `.stat-label` mono 11px muted, `.stat-value` Anton `--size-stat`. Used by game scores, type test stats, Busify countdown.
- **`.marquee` / `.marquee-track`**: `overflow:hidden`; track animates `translateX(0 → -50%)` linear infinite; content duplicated by JS for a seamless loop; `animation-play-state: paused` on hover.
- **`.loading`**: inline mono `LOADING ▮▮▮▯▯`, cells step-animated. Replaces `#loader` spinner. Content is never hidden while loading.
- **Focus:** `:focus-visible { outline: 2px dashed var(--border-color); outline-offset: 3px; }`.

### `site.js`

Five independent features, each a no-op if its target element is absent. Runs on `DOMContentLoaded`.

1. **Theme** — global `toggleTheme()`: flips `document.documentElement.dataset.theme`, writes `localStorage.theme` (`'light'` / `'dark'`, wrapped in try/catch), updates `.theme-toggle` label, dispatches `document.dispatchEvent(new CustomEvent('themechange'))`. Also sets the correct label on load.
2. **Clock** — updates `.clock` with local `HH:MM:SS` every second (runs under reduced motion too).
3. **Marquee** — for each `.marquee-track`, duplicates its children once so `-50%` loops seamlessly; for each `.index-row`, builds the hover marquee from the title. Speed set via CSS custom property based on content width (≈ 80px/s).
4. **Scramble** — elements with `[data-scramble]`: on load and on `mouseenter`, letters cycle random `A–Z0–9` and resolve left-to-right over ~600ms in stepped frames; spaces preserved; final text always equals original. `aria-label` set to the real text so screen readers aren't affected.
5. **Cursor** — only when `matchMedia('(pointer: fine)')`: a fixed 16px square `div.cursor` with `mix-blend-mode: difference` and white fill, follows pointer via `transform` in `requestAnimationFrame`; grows to 48px over `a, button, .index-row`; hidden while over `canvas` and `.cell`; native cursor stays visible (not replaced) so precision isn't lost.

**Reduced motion** (`prefers-reduced-motion: reduce`): marquees don't animate (static text, no duplication visible), scramble skipped, live-dot doesn't blink. Clock and cursor still work.

## 3. Pages

### `index.html` (landing)
Top bar (no `← INDEX`) → `h1.hero` "CAN U BE" (`--size-hero`, `data-scramble`, full width) → `nav.index` with 8 `.index-row` links:
`01 MUSIC PLAYER` (`index1.html`), `02 BENEVOLENT INEQUALITY`, `03 BUSIFY PODCAST`, `04 SNAKE`, `05 PLINKO`, `06 TIC TAC TOE`, `07 TYPE SPEED TEST`, `08 TIME MACHINE` → ticker. Existing meta/OG/Twitter tags kept.

### `index1.html` (Music Player)
Page head `CAN U BE` / meta `01 / MUSIC PLAYER`. Native `<audio controls>` full content width, `.loading` shown until `canplaythrough`, then hidden. Content always visible.

### `benevolent-inequality.html`
Page head `BENEVOLENT INEQUALITY` / meta `02 / TODAY: <DAY> — <SONG TITLE>` (filled by existing script). Artwork in 2px frame, up to content width. `.loading` + native audio as above. Song rotation logic unchanged; the debug `console.log` may stay.

### `busify.html`
Page head `BUSIFY` / meta `03 / PODCAST`. Marquee band `LAUNCHING 10.31.26 · `. `.stat-row` with DAYS / HRS / MIN / SEC, values zero-padded to 2 digits (days unpadded if ≥100). Target: `new Date('2026-10-31T07:00:00Z')` (Oct 31 2026, 12:00 AM MST, UTC−7). On expiry: band text becomes `LIVE NOW · `, digits show `00`, interval cleared. Description copy kept. Meta description/OG updated to "Launching October 31, 2026".

### `snake.html`
Page head `SNAKE` / meta `04 / ARROW KEYS TO MOVE`. `.stat-row` with SCORE. Canvas with 2px border. Game-over message in mono + restart instruction as today.
Canvas colors: read `getComputedStyle(document.documentElement).getPropertyValue('--bg-color'/'--text-color')`. Apple drawn as a **hollow square** (2px stroke) in fg color — no red. Redraw on `themechange`. Theme check moves from `document.body` to `document.documentElement`. No logic changes.

### `plinko.html`
Page head `PLINKO` / meta `05 / CLICK ABOVE THE BOARD TO DROP`. `.stat-row` SCORE. Canvas 2px border. Reset → `.btn`. Canvas colors from CSS vars as above; slot labels `12px "JetBrains Mono", monospace`. Redraw on `themechange`. No logic changes.

### `tictactoe.html`
Page head `TIC TAC TOE` / meta `06 / YOU ARE X`. Inline `<style>` removed; styles moved to `styles.css`. Board: 3×3 `.cell` buttons, 2px collapsed borders, X/O in Anton. Status line mono. Reset → `.btn`. No logic changes (class names used by script kept, except reset button class → `.btn`, id unchanged).

### `type speed test/index.html`
Page head `TYPE SPEED TEST` / meta `07 / TYPE THE WORDS AS THEY APPEAR`. Length buttons → `.btn` (`.is-active` for selected). Stats → `.stat-row` (WPM / ACCURACY / TIME). Words container 2px border, mono text; `.char.incorrect` inverted; current word underlined 2px. Finished panel bordered, Anton heading. Length buttons carry both classes (`class="btn length-btn"`) so the script's `.length-btn` selectors keep working. `script.js`: the only change is `'active'` → `'is-active'` for length buttons (lines ~379–380). `type speed test/styles.css` deleted and its `<link>` removed.

### `time-machine.html`
Page head `TIME MACHINE` / meta `08 / PAST VERSIONS OF THIS SITE`. Three `.index-row`s: `V1 AUGUST 2024`, `V2 SEPTEMBER 2024`, `V3 OCTOBER 2024`. Favicon added.

### `404.html`
Full shell (with `← INDEX`). Giant `404` (`--size-hero`, `data-scramble`), mono `PAGE NOT FOUND`, `.btn` link to `index.html`. Inline `<style>` removed. Uses root-absolute-safe relative paths (GitHub Pages serves 404 at arbitrary paths — use `/styles.css`, `/site.js`, `/index.html`, `/images/favicon.ico`).

## Testing

No test harness exists; verification is manual via Playwright against a local static server:

1. Every live page at 1280px and 375px, dark and light: renders, no horizontal scroll, no console errors, fonts loaded.
2. Theme toggle persists across navigation; no flash of wrong theme on load.
3. Toggling theme redraws snake and plinko canvases in new colors.
4. Snake: moves, eats apple, score increments, game over shows. Plinko: ball drops and scores; reset works. Tic-tac-toe: full round to win/draw; reset works. Type test: 30s run completes and shows results; length buttons switch.
5. Busify shows a plausible remaining time to 2026-10-31T07:00Z.
6. With `prefers-reduced-motion: reduce` emulated: marquees static, no scramble.
7. Keyboard: Tab reaches toggle, index rows, buttons; focus outline visible.
8. `time-machine/` directory diff is empty.
