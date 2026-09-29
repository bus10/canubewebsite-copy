# Can U Be Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin every live page of the static "Can U Be" site into a louder, animated black/white brutalist system (huge Anton type, mono utility text, marquees, live clock, scramble headings, inverting cursor) without changing any game/music logic.

**Architecture:** Shared chrome (top bar, ticker footer) is static markup duplicated in each page. One rewritten global `styles.css` holds tokens + components + page sections; one new `site.js` (replacing `theme.js`) exposes four globals (`toggleTheme`, `themeColors`, `setMarqueeText`, `watchAudio`) and auto-initializes clock, marquees, index rows, scramble, and cursor. A Playwright script in `tools/` is the test suite.

**Tech Stack:** Plain HTML/CSS/JS (no build), Google Fonts (Anton, JetBrains Mono), Node 22 + Playwright (dev-only verification, in `tools/`), Python `http.server` for local serving.

**Spec:** `docs/superpowers/specs/2026-09-28-site-redesign-design.md` — read it before starting.

## Global Constraints

- Colors: only `#000` and `#fff`, only via `--bg-color` / `--text-color` / `--border-color`. No hex colors in page markup or page scripts; canvases get colors from `themeColors()`.
- Fonts: `Anton` (display) and `JetBrains Mono` 400/700 (utility), loaded via `https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap` with preconnects.
- Theme: `data-theme="light"` on `<html>`; dark = attribute absent. `localStorage` key `theme`, values `'light'` / `'dark'`. Toggle label is the theme you'd switch to: `[LIGHT]` in dark, `[DARK]` in light. No color transitions.
- Motion: `linear` or `steps()` only. Under `prefers-reduced-motion: reduce`: no marquee animation, no scramble, no blinking dot. Clock and cursor still run.
- Busify target: `new Date('2026-10-31T07:00:00Z')` (Oct 31 2026, 12:00 AM MST, UTC−7).
- Do not modify anything under `time-machine/`. Baseline commit for comparison: `12364c0`.
- Do not change game rules, speeds, scoring, the Benevolent Inequality rotation table, or the type test's word/scoring logic.
- No build step, no framework. `tools/` is dev-only and never referenced by site pages.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`localStorage` throws** (Safari private mode, blocked site data) → page still loads with no errors and the toggle still switches theme. Test: `focus:localstorage-blocked` (Task 1).
2. **Custom cursor intercepts clicks** → clicking a link under the cursor square must still navigate. Test: `focus:cursor-no-intercept` (Task 1).
3. **Rapid re-hover on a scrambling heading** → heading always settles on its real text. Test: `focus:rapid-rehover` (Task 1).
4. **Audio never becomes playable** (404, or iOS Safari which doesn't preload) → loading indicator must not hang: error shows `AUDIO UNAVAILABLE`; pressing play hides it. Tests: `focus:audio-error`, `focus:audio-play-hides-loading` (Task 2).
5. **Global uppercase leaking into typed content** → type test words must render in their real (lowercase) case so what you see is what you type. Test: `focus:type-case` (Task 6).

---

## File Map

| Path | Responsibility | Task |
|---|---|---|
| `tools/package.json`, `tools/package-lock.json` | Dev-only Playwright dependency | 0 |
| `tools/check.mjs` | Verification suite + screenshot mode | 0 (tests appended every task) |
| `.gitignore` | Ignore `tools/shots/` | 0 |
| `styles.css` | Tokens, base, shell, components (Task 1); page sections appended in Tasks 2–6 | 1–6 |
| `site.js` | Theme, clock, marquee, index rows, scramble, cursor, audio status | 1 |
| `index.html` | Landing | 1 |
| `index1.html`, `benevolent-inequality.html` | Music pages | 2 |
| `busify.html` | Countdown | 3 |
| `snake.html`, `plinko.html` | Canvas games | 4 |
| `tictactoe.html` | DOM game | 5 |
| `type speed test/index.html`, `type speed test/script.js`; delete `type speed test/styles.css` | Type test | 6 |
| `time-machine.html`, `404.html` | Archive index, not-found | 7 |
| delete `theme.js`; `sitemap.xml`, `CLAUDE.md` | Cleanup + docs | 8 |

**Intermediate state warning:** after Task 1 rewrites `styles.css`, not-yet-converted pages look broken until their task lands. That's expected on the branch; merge only after Task 8.

### Shared page shell (referenced by Tasks 1–7)

Every page's `<head>` contains, in this order, after `charset`/`viewport`/`title`/meta tags:

```html
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
```

Every `<body>` is: `header.topbar` → `main.page` → `footer.ticker` → `<script src="site.js"></script>` → optional page script. Each task below shows the complete markup for its pages; `type speed test/` uses `../` prefixes and `404.html` uses `/` prefixes.

---

### Task 0: Verification harness

**Files:**
- Create: `tools/package.json`, `tools/check.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces (used by every later task's tests, all in `tools/check.mjs`):
  - `test(name: string, fn: () => Promise<void>)`
  - `assert(condition: any, message: string)`
  - `withPage(key: keyof PAGES, opts: {width?, theme?: 'light'|'dark', reducedMotion?: 'reduce'|'no-preference', initScript?: Function, route?: [pattern, handler], fixedTime?: string, installClock?: boolean, waitUntil?: string, url?: string}, fn: ({page, context, errors, requests}) => Promise<void>)`
  - `pixel(page, selector, x, y) → Promise<[r,g,b]>`, `isGrayscale(page, selector) → Promise<boolean>`
  - `shellTests(key)` registers `shell:<key>` and `mobile:<key>`
  - `ROOT` (repo root path), `BASE` (`http://127.0.0.1:8765/`), `PAGES` map
  - Marker comments `// ==== TESTS (tasks append below this line) ====` and `// ==== RUNNER ====`; later tasks insert their test blocks directly above `// ==== RUNNER ====`.

- [ ] **Step 1: Create a branch**

If you are not already in an isolated worktree:

```bash
git checkout -b redesign
```

- [ ] **Step 2: Create `tools/package.json`**

```json
{
  "name": "canube-checks",
  "private": true,
  "type": "module",
  "description": "Dev-only browser verification for the static site. Not used by any page.",
  "scripts": {
    "check": "node check.mjs"
  }
}
```

- [ ] **Step 3: Install Playwright and Chromium**

```bash
cd tools && npm install --save-dev playwright && npx playwright install chromium && cd ..
```

Expected: `tools/node_modules/` and `tools/package-lock.json` exist; Chromium download finishes (or reports already installed). `node_modules/` is already gitignored.

- [ ] **Step 4: Add screenshots dir to `.gitignore`**

Append to `.gitignore`:

```
# Verification screenshots (tools/check.mjs --shots)
tools/shots/
```

- [ ] **Step 5: Create `tools/check.mjs`**

```js
// Browser verification suite for the Can U Be redesign.
// Serve the repo root first:  python3 -m http.server 8765 --bind 127.0.0.1
// Run all checks:             node tools/check.mjs
// Run a subset by prefix:     node tools/check.mjs shell:index theme:
// Screenshots for eyeballing: node tools/check.mjs --shots   (writes tools/shots/*.png)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const PAGES = {
    index: 'index.html',
    music: 'index1.html',
    bi: 'benevolent-inequality.html',
    busify: 'busify.html',
    snake: 'snake.html',
    plinko: 'plinko.html',
    ttt: 'tictactoe.html',
    type: 'type%20speed%20test/index.html',
    tm: 'time-machine.html',
    notfound: '404.html',
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

let browser;

async function open(key, opts = {}) {
    const context = await browser.newContext({
        viewport: { width: opts.width || 1280, height: 900 },
        reducedMotion: opts.reducedMotion || 'no-preference',
    });
    if (opts.theme) await context.addInitScript(t => { try { localStorage.setItem('theme', t); } catch (e) {} }, opts.theme);
    if (opts.initScript) await context.addInitScript(opts.initScript);
    if (opts.route) await context.route(opts.route[0], opts.route[1]);
    const page = await context.newPage();
    if (opts.fixedTime) await page.clock.setFixedTime(new Date(opts.fixedTime));
    if (opts.installClock) await page.clock.install();
    const errors = [];
    const requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => requests.push(r.url()));
    await page.goto(opts.url || BASE + PAGES[key], { waitUntil: opts.waitUntil || 'load' });
    return { page, context, errors, requests };
}

async function withPage(key, opts, fn) {
    const session = await open(key, opts);
    try { await fn(session); } finally { await session.context.close(); }
}

// Pixel [r, g, b] from a canvas bitmap
const pixel = (page, selector, x, y) => page.evaluate(([s, px, py]) => {
    const c = document.querySelector(s);
    return Array.from(c.getContext('2d').getImageData(px, py, 1, 1).data.slice(0, 3));
}, [selector, x, y]);

// True when every canvas pixel is a shade of gray (strict black/white ink)
const isGrayscale = (page, selector) => page.evaluate(s => {
    const c = document.querySelector(s);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== d[i + 1] || d[i + 1] !== d[i + 2]) return false;
    }
    return true;
}, selector);

// Registers the shared-shell checks for one page (desktop + 375px)
function shellTests(key) {
    test(`shell:${key}`, () => withPage(key, {}, async ({ page, errors, requests }) => {
        await page.waitForTimeout(300);
        const r = await page.evaluate(() => {
            const head = [...document.head.children];
            const snippet = head.findIndex(el => el.tagName === 'SCRIPT' && el.textContent.includes("localStorage.getItem('theme')"));
            const sheet = head.findIndex(el => el.matches('link[rel="stylesheet"][href$="styles.css"]'));
            return {
                topbar: !!document.querySelector('header.topbar .clock') && !!document.querySelector('header.topbar .theme-toggle'),
                back: !!document.querySelector('.topbar-back'),
                ticker: !!document.querySelector('footer.ticker .marquee-track'),
                h1: !!document.querySelector('main h1'),
                globals: ['toggleTheme', 'themeColors', 'setMarqueeText', 'watchAudio'].every(n => typeof window[n] === 'function'),
                oldChrome: !!document.querySelector('.container, .nav-link, #loader, .footer, .score, .controls'),
                headStyles: document.head.querySelectorAll('style').length,
                fonts: !!document.querySelector('link[href*="fonts.googleapis.com/css2"][href*="Anton"][href*="JetBrains+Mono"]'),
                favicon: !!document.querySelector('link[rel="icon"]'),
                snippetBeforeSheet: snippet !== -1 && sheet !== -1 && snippet < sheet,
            };
        });
        assert(r.topbar, 'header.topbar with .clock and .theme-toggle missing');
        assert(r.back === (key !== 'index'), key === 'index' ? 'landing must not have .topbar-back' : '.topbar-back missing');
        assert(r.ticker, 'footer.ticker .marquee-track missing');
        assert(r.h1, 'main h1 missing');
        assert(r.globals, 'site.js globals missing');
        assert(!r.oldChrome, 'old chrome classes still present');
        assert(r.headStyles === 0, 'inline <style> in <head>');
        assert(r.fonts, 'Google Fonts link for Anton + JetBrains Mono missing');
        assert(r.favicon, 'favicon link missing');
        assert(r.snippetBeforeSheet, 'theme snippet must come before styles.css in <head>');
        assert(!requests.some(u => u.endsWith('/theme.js')), 'theme.js still requested');
        assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
    }));
    test(`mobile:${key}`, () => withPage(key, { width: 375 }, async ({ page }) => {
        await page.waitForTimeout(1000);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(overflow <= 0, `horizontal overflow of ${overflow}px at 375px`);
    }));
}

test('harness:smoke', () => withPage('index', {}, async ({ page }) => {
    assert(/can u be/i.test(await page.title()), 'index.html did not load');
}));

// ==== TESTS (tasks append below this line) ====

// ==== RUNNER ====
async function shots() {
    const dir = path.join(ROOT, 'tools', 'shots');
    mkdirSync(dir, { recursive: true });
    for (const key of Object.keys(PAGES)) {
        for (const width of [1280, 375]) {
            for (const theme of ['dark', 'light']) {
                await withPage(key, { width, theme }, async ({ page }) => {
                    await page.waitForTimeout(1000);
                    await page.screenshot({ path: path.join(dir, `${key}-${width}-${theme}.png`), fullPage: true });
                });
            }
        }
    }
    console.log('Screenshots written to ' + dir);
}

const args = process.argv.slice(2);
browser = await chromium.launch();
if (args.includes('--shots')) {
    await shots();
    await browser.close();
    process.exit(0);
}
const selected = tests.filter(t => !args.length || args.some(a => t.name.startsWith(a)));
let failed = 0;
for (const t of selected) {
    try {
        await t.fn();
        console.log(`PASS  ${t.name}`);
    } catch (e) {
        failed++;
        console.log(`FAIL  ${t.name} — ${e.message.split('\n')[0]}`);
    }
}
await browser.close();
if (!selected.length) console.log('No tests matched: ' + args.join(' '));
console.log(`\n${selected.length - failed}/${selected.length} passed`);
process.exit(failed || !selected.length ? 1 : 0);
```

- [ ] **Step 6: Start the static server (leave it running for all tasks)**

From the repo root, run in the background:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

- [ ] **Step 7: Run the smoke test**

Run: `node tools/check.mjs harness:`
Expected: `PASS  harness:smoke` and `1/1 passed`.

- [ ] **Step 8: Commit**

```bash
git add tools/package.json tools/package-lock.json tools/check.mjs .gitignore
git commit -m "Add Playwright verification harness for redesign

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Design system + landing page

**Files:**
- Rewrite: `styles.css` (whole file)
- Create: `site.js`
- Rewrite: `index.html` (whole file)
- Modify: `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: Task 0 harness.
- Produces (globals on `window`, used by Tasks 2–7):
  - `toggleTheme(): void` — flips theme, persists, relabels `.theme-toggle`, dispatches `document` event `themechange` with `detail.theme: 'light'|'dark'`.
  - `themeColors(): {bg: string, fg: string}` — current `--bg-color` / `--text-color` values (`'#000'`/`'#fff'`).
  - `setMarqueeText(marquee: Element /* .marquee */, text: string): void` — replaces the marquee's content; rebuilds it if already initialized.
  - `watchAudio(audio: HTMLAudioElement, status: HTMLElement /* .loading */): void` — hides `status` once audio is usable (`loadedmetadata`/`canplay`/`canplaythrough`/`play`); on error sets it to `AUDIO UNAVAILABLE` with class `is-error`.
- Produces (CSS classes used by later tasks): `.topbar .topbar-home .live-dot .clock .topbar-back .theme-toggle`, `.page .page--wide .page-head .meta .copy .hero`, `.ticker .marquee .marquee-track`, `.index .index-row .index-num .index-title .index-arrow` (+ JS-added `.index-title-text`, `.has-marquee`), `.btn .btn.is-active .btn-row`, `.stat-row .stat .stat-label .stat-value`, `.loading .loading-bar`, `.cursor`, attribute `data-scramble`.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====` in `tools/check.mjs`:

```js
// ---- Task 1: design system + landing ----
shellTests('index');

test('fonts:loaded', () => withPage('index', {}, async ({ page }) => {
    const loaded = await page.evaluate(async () => {
        await document.fonts.ready;
        const families = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, ''));
        return { anton: families.includes('Anton'), mono: families.includes('JetBrains Mono') };
    });
    assert(loaded.anton && loaded.mono, 'web fonts not loaded (needs network): ' + JSON.stringify(loaded));
}));

test('theme:toggle-persists', () => withPage('index', {}, async ({ page }) => {
    assert(await page.textContent('.theme-toggle') === '[LIGHT]', 'dark-mode label should be [LIGHT]');
    await page.click('.theme-toggle');
    assert(await page.getAttribute('html', 'data-theme') === 'light', 'html[data-theme] not light after toggle');
    assert(await page.textContent('.theme-toggle') === '[DARK]', 'light-mode label should be [DARK]');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(bg === 'rgb(255, 255, 255)', 'body background not white in light mode: ' + bg);
    await page.reload();
    assert(await page.getAttribute('html', 'data-theme') === 'light', 'theme not persisted across reload');
    assert(await page.textContent('.theme-toggle') === '[DARK]', 'label wrong after reload in light mode');
    await page.click('.theme-toggle');
    assert(await page.getAttribute('html', 'data-theme') === null, 'toggling back to dark failed');
}));

test('theme:event-and-colors', () => withPage('index', {}, async ({ page }) => {
    await page.evaluate(() => {
        window.__themeEvents = [];
        document.addEventListener('themechange', e => window.__themeEvents.push(e.detail.theme));
    });
    const dark = await page.evaluate(() => themeColors());
    assert(dark.bg === '#000' && dark.fg === '#fff', 'themeColors() in dark: ' + JSON.stringify(dark));
    await page.click('.theme-toggle');
    const light = await page.evaluate(() => themeColors());
    assert(light.bg === '#fff' && light.fg === '#000', 'themeColors() in light: ' + JSON.stringify(light));
    await page.click('.theme-toggle');
    const events = await page.evaluate(() => window.__themeEvents);
    assert(JSON.stringify(events) === '["light","dark"]', 'themechange events: ' + JSON.stringify(events));
}));

test('theme:hard-cut', () => withPage('index', {}, async ({ page }) => {
    const d = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
    assert(d === '0s', 'body has a color transition: ' + d);
}));

test('motion:clock', () => withPage('index', {}, async ({ page }) => {
    const first = await page.textContent('.clock');
    assert(/^\d\d:\d\d:\d\d$/.test(first), 'clock format wrong: ' + first);
    await page.waitForTimeout(1200);
    assert(await page.textContent('.clock') !== first, 'clock did not tick');
}));

test('motion:ticker', () => withPage('index', {}, async ({ page }) => {
    const r = await page.evaluate(() => {
        const t = document.querySelector('.ticker .marquee-track');
        return { n: t.children.length, anim: getComputedStyle(t).animationName, w: t.scrollWidth, cw: t.parentElement.clientWidth };
    });
    assert(r.anim === 'marquee', 'ticker not animating: ' + r.anim);
    assert(r.n >= 4 && r.w >= 2 * r.cw, `ticker not filled + duplicated (children ${r.n}, width ${r.w}, container ${r.cw})`);
}));

test('motion:scramble', () => withPage('index', {}, async ({ page }) => {
    assert(await page.getAttribute('h1', 'aria-label') === 'CAN U BE', 'h1 aria-label should be the real text');
    await page.waitForTimeout(900);
    assert(await page.textContent('h1') === 'CAN U BE', 'scramble did not resolve to real text');
}));

test('motion:reduced', () => withPage('index', { reducedMotion: 'reduce' }, async ({ page }) => {
    const r = await page.evaluate(() => ({
        ticker: getComputedStyle(document.querySelector('.ticker .marquee-track')).animationName,
        dot: getComputedStyle(document.querySelector('.live-dot')).animationName,
        h1: document.querySelector('h1').textContent,
        rowMarquee: !!document.querySelector('.index-row .marquee-track'),
    }));
    assert(r.ticker === 'none' && r.dot === 'none', 'animations running under reduced motion');
    assert(r.h1 === 'CAN U BE', 'h1 scrambled under reduced motion: ' + r.h1);
    assert(!r.rowMarquee, 'index rows built marquees under reduced motion');
    await page.locator('.index-row').first().hover();
    const visible = await page.locator('.index-row').first().locator('.index-title-text').isVisible();
    assert(visible, 'row title disappears on hover under reduced motion');
}));

test('motion:cursor', () => withPage('index', {}, async ({ page }) => {
    await page.mouse.move(200, 300);
    const r = await page.evaluate(() => {
        const c = document.querySelector('.cursor');
        return c && { pe: getComputedStyle(c).pointerEvents, blend: getComputedStyle(c).mixBlendMode };
    });
    assert(r, '.cursor missing on a fine-pointer device');
    assert(r.pe === 'none' && r.blend === 'difference', 'cursor styles wrong: ' + JSON.stringify(r));
}));

test('index:rows', () => withPage('index', {}, async ({ page }) => {
    const rows = await page.$$eval('.index-row', els => els.map(e => [
        e.getAttribute('href'),
        e.querySelector('.index-num').textContent.trim(),
        e.querySelector('.index-title-text').textContent.trim(),
    ]));
    const expected = [
        ['index1.html', '01', 'MUSIC PLAYER'],
        ['benevolent-inequality.html', '02', 'BENEVOLENT INEQUALITY'],
        ['busify.html', '03', 'BUSIFY PODCAST'],
        ['snake.html', '04', 'SNAKE'],
        ['plinko.html', '05', 'PLINKO'],
        ['tictactoe.html', '06', 'TIC TAC TOE'],
        ['type speed test/index.html', '07', 'TYPE SPEED TEST'],
        ['time-machine.html', '08', 'TIME MACHINE'],
    ];
    assert(JSON.stringify(rows) === JSON.stringify(expected), 'rows: ' + JSON.stringify(rows));
}));

test('index:row-hover', () => withPage('index', {}, async ({ page }) => {
    const row = page.locator('.index-row').nth(1);
    await row.hover();
    const r = await row.evaluate(e => {
        const t = e.querySelector('.marquee-track');
        return { bg: getComputedStyle(e).backgroundColor, display: t && getComputedStyle(t).display, anim: t && getComputedStyle(t).animationName };
    });
    assert(r.bg === 'rgb(255, 255, 255)', 'hovered row not inverted: ' + r.bg);
    assert(r.display === 'inline-flex' && r.anim === 'marquee', 'row marquee not running on hover: ' + JSON.stringify(r));
}));

test('a11y:tab-order', () => withPage('index', {}, async ({ page }) => {
    await page.keyboard.press('Tab'); // .topbar-home
    await page.keyboard.press('Tab'); // .theme-toggle
    await page.keyboard.press('Tab'); // first .index-row
    const r = await page.evaluate(() => {
        const a = document.activeElement;
        const cs = getComputedStyle(a);
        return { cls: a.className, outline: cs.outlineStyle, bg: cs.backgroundColor };
    });
    assert(r.cls.includes('index-row'), 'third Tab should land on first index row, got: ' + r.cls);
    assert(r.outline === 'dashed', 'focused row has no dashed outline');
    assert(r.bg === 'rgb(255, 255, 255)', 'focused row not inverted');
}));

test('focus:localstorage-blocked', () => withPage('index', {
    initScript: () => Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('blocked', 'SecurityError'); },
    }),
}, async ({ page, errors }) => {
    await page.click('.theme-toggle');
    assert(await page.getAttribute('html', 'data-theme') === 'light', 'toggle failed when localStorage is blocked');
    assert(errors.length === 0, 'errors with blocked localStorage: ' + errors.join(' | '));
}));

test('focus:cursor-no-intercept', () => withPage('index', {}, async ({ page }) => {
    await page.locator('.index-row').nth(3).scrollIntoViewIfNeeded();
    const box = await page.locator('.index-row').nth(3).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    await page.mouse.click(x, y);
    await page.waitForURL(/snake\.html$/, { timeout: 3000 });
}));

test('focus:rapid-rehover', () => withPage('index', {}, async ({ page }) => {
    for (let i = 0; i < 6; i++) {
        await page.hover('h1');
        await page.mouse.move(5, 5);
        await page.waitForTimeout(60);
    }
    await page.waitForTimeout(900);
    assert(await page.textContent('h1') === 'CAN U BE', 'heading stuck scrambled after rapid re-hover');
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:index mobile:index fonts: theme: motion: index: a11y: focus:`
Expected: most FAIL (e.g. `shell:index — header.topbar with .clock and .theme-toggle missing`, `index:rows — ... Cannot read properties of null`).

- [ ] **Step 3: Rewrite `styles.css`**

Replace the whole file with:

```css
/* =========================================================
   CAN U BE — global stylesheet
   Strict black/white brutalism. Colors only come from the
   tokens below; never hardcode colors in pages.
   ========================================================= */

/* ---- Tokens ---- */
:root {
    --bg-color: #000;
    --text-color: #fff;
    --border-color: #fff;
    --muted: 0.55;
    --rule: 2px;

    --font-display: "Anton", Impact, "Arial Narrow Bold", sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

    --size-hero: clamp(72px, 22vw, 360px);
    --size-h1: clamp(56px, 14vw, 200px);
    --size-row: clamp(36px, 8vw, 104px);
    --size-stat: clamp(40px, 9vw, 120px);

    --s1: 4px;
    --s2: 8px;
    --s3: 16px;
    --s4: 24px;
    --s5: 48px;
    --s6: 96px;

    --content: 1100px;
    color-scheme: dark;
}

[data-theme="light"] {
    --bg-color: #fff;
    --text-color: #000;
    --border-color: #000;
    color-scheme: light;
}

/* ---- Base ---- */
*, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

[hidden] {
    display: none !important;
}

html {
    background: var(--bg-color);
}

body {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-color);
    color: var(--text-color);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    -webkit-font-smoothing: antialiased;
}

a {
    color: inherit;
    text-decoration: none;
}

button {
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: inherit;
    background: none;
    border: 0;
    cursor: pointer;
}

img {
    display: block;
    max-width: 100%;
    height: auto;
}

:focus {
    outline: none;
}

:focus-visible {
    outline: 2px dashed var(--border-color);
    outline-offset: 3px;
}

::selection {
    background: var(--text-color);
    color: var(--bg-color);
}

h1 {
    font-family: var(--font-display);
    font-size: var(--size-h1);
    font-weight: 400;
    line-height: 0.85;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
}

/* ---- Top bar ---- */
.topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s2) var(--s3);
    background: var(--bg-color);
    border-bottom: var(--rule) solid var(--border-color);
    font-size: 11px;
}

.topbar-home {
    font-weight: 700;
}

.live-dot {
    animation: blink 1s steps(1) infinite;
}

.clock {
    font-variant-numeric: tabular-nums;
}

.topbar-back,
.theme-toggle {
    margin-left: auto;
}

.topbar-back + .theme-toggle {
    margin-left: 0;
}

.theme-toggle {
    padding: var(--s1) var(--s2);
    border: var(--rule) solid var(--border-color);
}

.topbar a:hover,
.theme-toggle:hover {
    background: var(--text-color);
    color: var(--bg-color);
}

@keyframes blink {
    50% { opacity: 0; }
}

/* ---- Page layout ---- */
.page {
    flex: 1;
    width: 100%;
    max-width: var(--content);
    margin: 0 auto;
    padding: 0 var(--s3) var(--s6);
}

.page--wide {
    max-width: none;
    padding: 0 0 var(--s6);
}

.page-head {
    padding: var(--s5) 0 var(--s4);
    margin-bottom: var(--s5);
    border-bottom: var(--rule) solid var(--border-color);
}

.hero {
    font-size: var(--size-hero);
    padding: var(--s4) 0 var(--s3);
}

.page--wide .hero,
.page--wide .page-head {
    padding-left: var(--s3);
    padding-right: var(--s3);
    margin-bottom: 0;
    border-bottom: var(--rule) solid var(--border-color);
}

.meta {
    margin-top: var(--s3);
    font-size: 11px;
    opacity: var(--muted);
}

.copy {
    max-width: 60ch;
    margin-top: var(--s4);
    opacity: var(--muted);
}

/* ---- Marquee + ticker footer ---- */
.marquee {
    overflow: hidden;
    white-space: nowrap;
}

.marquee-track {
    display: inline-flex;
    animation: marquee var(--marquee-duration, 20s) linear infinite;
}

.marquee-track > * {
    flex: none;
}

.marquee:hover .marquee-track {
    animation-play-state: paused;
}

@keyframes marquee {
    to { transform: translateX(-50%); }
}

.ticker {
    padding: var(--s2) 0;
    border-top: var(--rule) solid var(--border-color);
    font-size: 11px;
}

/* ---- Index rows (landing, time machine) ---- */
.index-row {
    display: grid;
    grid-template-columns: 3ch minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s3);
    padding: var(--s2) var(--s3);
    border-bottom: var(--rule) solid var(--border-color);
}

.index-num {
    font-size: 11px;
}

.index-title {
    --marquee-duration: 12s;
    display: block;
    overflow: hidden;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--size-row);
    line-height: 1.05;
}

.index-arrow {
    font-size: clamp(20px, 4vw, 48px);
    line-height: 1;
}

.index-row .marquee-track {
    display: none;
}

.index-row:hover,
.index-row:focus-visible {
    background: var(--text-color);
    color: var(--bg-color);
}

.index-row:focus-visible {
    outline-color: var(--bg-color);
    outline-offset: -6px;
}

.index-row.has-marquee:hover .index-title-text,
.index-row.has-marquee:focus-visible .index-title-text {
    display: none;
}

.index-row:hover .marquee-track,
.index-row:focus-visible .marquee-track {
    display: inline-flex;
}

/* ---- Buttons ---- */
.btn {
    display: inline-block;
    padding: var(--s2) var(--s4);
    border: var(--rule) solid var(--border-color);
    font-size: 13px;
    line-height: 1.4;
    text-align: center;
}

.btn:hover,
.btn.is-active {
    background: var(--text-color);
    color: var(--bg-color);
}

.btn:active {
    transform: translate(2px, 2px);
}

.btn:disabled {
    opacity: var(--muted);
    cursor: not-allowed;
}

.btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
    margin: var(--s4) 0;
}

/* ---- Stats (scores, type test, countdown) ---- */
.stat-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    margin: var(--s4) 0;
    border-top: var(--rule) solid var(--border-color);
    border-left: var(--rule) solid var(--border-color);
}

.stat {
    min-width: 0;
    padding: var(--s3);
    border-right: var(--rule) solid var(--border-color);
    border-bottom: var(--rule) solid var(--border-color);
}

.stat-label {
    display: block;
    margin-bottom: var(--s2);
    font-size: 11px;
    opacity: var(--muted);
}

.stat-value {
    display: block;
    font-family: var(--font-display);
    font-size: var(--size-stat);
    line-height: 0.9;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
}

/* ---- Loading status ---- */
.loading {
    margin: var(--s4) 0;
    font-size: 11px;
}

.loading-bar {
    display: inline-block;
    width: 5ch;
    height: 0.9em;
    margin-left: var(--s2);
    vertical-align: -0.1em;
    border: 1px solid var(--border-color);
    background: linear-gradient(var(--text-color), var(--text-color)) left / 0% 100% no-repeat;
    animation: loading 1.5s steps(5, jump-none) infinite;
}

@keyframes loading {
    to { background-size: 100% 100%; }
}

/* ---- Cursor (fine pointers only; created by site.js) ---- */
.cursor {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    background: #fff; /* white + difference = inverts whatever is underneath, in both themes */
    mix-blend-mode: difference;
    pointer-events: none;
    transform: translate(-100px, -100px);
}

.cursor.is-big {
    width: 48px;
    height: 48px;
    margin: -24px 0 0 -24px;
}

.cursor.is-hidden {
    display: none;
}

/* ---- Small screens ---- */
@media (max-width: 600px) {
    .topbar {
        gap: var(--s2);
        padding: var(--s2);
    }

    .index-title {
        white-space: normal;
    }
}

/* ---- Reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
    .marquee-track,
    .live-dot,
    .loading-bar {
        animation: none;
    }
}

/* ==== Page sections (appended by later tasks) ==== */
```

- [ ] **Step 4: Create `site.js`**

```js
/* CAN U BE — shared behavior, loaded on every page before page scripts.
   Globals for pages: toggleTheme(), themeColors(), setMarqueeText(), watchAudio(). */
(function () {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    /* ---- Theme ---- */
    function currentTheme() {
        return root.dataset.theme === 'light' ? 'light' : 'dark';
    }

    function updateToggleLabels() {
        const label = currentTheme() === 'light' ? '[DARK]' : '[LIGHT]';
        document.querySelectorAll('.theme-toggle').forEach(btn => { btn.textContent = label; });
    }

    function toggleTheme() {
        const next = currentTheme() === 'light' ? 'dark' : 'light';
        if (next === 'light') root.dataset.theme = 'light';
        else delete root.dataset.theme;
        try {
            localStorage.setItem('theme', next);
        } catch (e) {
            // Storage blocked (private mode): theme still switches for this page view
        }
        updateToggleLabels();
        document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    }

    // Current ink colors for <canvas> drawing
    function themeColors() {
        const style = getComputedStyle(root);
        return {
            bg: style.getPropertyValue('--bg-color').trim(),
            fg: style.getPropertyValue('--text-color').trim()
        };
    }

    /* ---- Clock ---- */
    function initClock() {
        const clocks = document.querySelectorAll('.clock');
        if (!clocks.length) return;
        const pad = n => String(n).padStart(2, '0');
        const tick = () => {
            const now = new Date();
            const text = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            clocks.forEach(el => { el.textContent = text; });
        };
        tick();
        setInterval(tick, 1000);
    }

    /* ---- Marquees ---- */
    function cloneHidden(node) {
        const copy = node.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        return copy;
    }

    // Fills the track until one half covers the container, then doubles it so
    // translateX(-50%) loops seamlessly. Idempotent: always rebuilds from the original unit.
    function buildMarquee(track) {
        if (!track.dataset.unit) track.dataset.unit = track.innerHTML;
        track.innerHTML = track.dataset.unit;
        track.dataset.built = '1';
        if (reducedMotion) return;
        const units = Array.from(track.children);
        const width = track.parentElement.clientWidth;
        if (!units.length || !width) return;
        for (let guard = 0; track.scrollWidth < width && guard < 50; guard++) {
            units.forEach(unit => track.appendChild(cloneHidden(unit)));
        }
        Array.from(track.children).forEach(unit => track.appendChild(cloneHidden(unit)));
        track.style.setProperty('--marquee-duration', (track.scrollWidth / 2 / 80) + 's'); // ~80px/s
    }

    function setMarqueeText(marquee, text) {
        const track = marquee.querySelector('.marquee-track');
        const span = document.createElement('span');
        span.textContent = text;
        track.dataset.unit = span.outerHTML;
        track.innerHTML = track.dataset.unit;
        if (track.dataset.built) buildMarquee(track);
    }

    function initMarquees() {
        const tracks = () => document.querySelectorAll('.marquee > .marquee-track');
        tracks().forEach(buildMarquee);
        if (reducedMotion) return;
        if (document.fonts) document.fonts.ready.then(() => tracks().forEach(buildMarquee));
        let timer;
        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(() => tracks().forEach(buildMarquee), 200);
        });
    }

    /* ---- Index rows: static title + hover marquee ---- */
    function initIndexRows() {
        document.querySelectorAll('.index-row').forEach(row => {
            const title = row.querySelector('.index-title');
            if (!title) return;
            const text = title.textContent.trim();
            title.textContent = '';
            const still = document.createElement('span');
            still.className = 'index-title-text';
            still.textContent = text;
            title.appendChild(still);
            if (reducedMotion) return;
            const track = document.createElement('span');
            track.className = 'marquee-track';
            track.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < 12; i++) {
                const unit = document.createElement('span');
                unit.textContent = text + '\u00a0·\u00a0';
                track.appendChild(unit);
            }
            title.appendChild(track);
            row.classList.add('has-marquee');
        });
    }

    /* ---- Scramble headings ---- */
    function scramble(el) {
        clearInterval(el._scrambleTimer);
        const text = el.dataset.text;
        const frames = 15; // 15 × 40ms ≈ 600ms
        let frame = 0;
        el._scrambleTimer = setInterval(() => {
            frame++;
            const resolved = Math.floor(text.length * frame / frames);
            let out = '';
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                out += (i < resolved || ch === ' ') ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            }
            el.textContent = out;
            if (frame >= frames) {
                clearInterval(el._scrambleTimer);
                el.textContent = text;
            }
        }, 40);
    }

    function initScramble() {
        document.querySelectorAll('[data-scramble]').forEach(el => {
            el.dataset.text = el.textContent.trim();
            el.setAttribute('aria-label', el.dataset.text);
            if (reducedMotion) return;
            scramble(el);
            el.addEventListener('mouseenter', () => scramble(el));
        });
    }

    /* ---- Cursor ---- */
    function initCursor() {
        if (!window.matchMedia('(pointer: fine)').matches) return;
        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        cursor.setAttribute('aria-hidden', 'true');
        document.body.appendChild(cursor);
        let x = -100;
        let y = -100;
        let queued = false;
        window.addEventListener('pointermove', e => {
            x = e.clientX;
            y = e.clientY;
            const target = e.target instanceof Element ? e.target : null;
            cursor.classList.toggle('is-hidden', !!(target && target.closest('canvas, .cell')));
            cursor.classList.toggle('is-big', !!(target && target.closest('a, button, .index-row')));
            if (!queued) {
                queued = true;
                requestAnimationFrame(() => {
                    queued = false;
                    cursor.style.transform = `translate(${x}px, ${y}px)`;
                });
            }
        }, { passive: true });
        document.addEventListener('mouseout', e => {
            if (!e.relatedTarget) cursor.classList.add('is-hidden');
        });
    }

    /* ---- Audio loading status ---- */
    function watchAudio(audio, status) {
        const ready = () => { status.hidden = true; };
        const fail = () => {
            status.hidden = false;
            status.classList.add('is-error');
            status.textContent = 'AUDIO UNAVAILABLE';
        };
        ['loadedmetadata', 'canplay', 'canplaythrough', 'play'].forEach(type => audio.addEventListener(type, ready));
        audio.addEventListener('error', fail);
        audio.querySelectorAll('source').forEach(source => source.addEventListener('error', fail));
        if (audio.readyState >= 1) ready();
        else if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) fail();
    }

    window.toggleTheme = toggleTheme;
    window.themeColors = themeColors;
    window.setMarqueeText = setMarqueeText;
    window.watchAudio = watchAudio;

    updateToggleLabels();
    document.addEventListener('DOMContentLoaded', () => {
        updateToggleLabels();
        initClock();
        initMarquees();
        initIndexRows();
        initScramble();
        initCursor();
    });
})();
```

- [ ] **Step 5: Rewrite `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Can U Be</title>
    <meta name="description" content="Can U Be – games, music experiments, archives, and the Busify podcast. A brutalist playground by @bus0.">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="https://bus10.github.io/">
    <!-- Open Graph -->
    <meta property="og:title" content="Can U Be">
    <meta property="og:description" content="Games, music rotations, archives & Busify podcast. A brutalist playground by @bus0.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://bus10.github.io/">
    <meta property="og:image" content="https://bus10.github.io/images/favicon.ico">
    <!-- Twitter -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Can U Be">
    <meta name="twitter:description" content="Games, music rotations, archives & Busify podcast.">
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page page--wide">
        <h1 class="hero" data-scramble>CAN U BE</h1>

        <nav class="index" aria-label="Sections">
            <a class="index-row" href="index1.html"><span class="index-num">01</span><span class="index-title">MUSIC PLAYER</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="benevolent-inequality.html"><span class="index-num">02</span><span class="index-title">BENEVOLENT INEQUALITY</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="busify.html"><span class="index-num">03</span><span class="index-title">BUSIFY PODCAST</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="snake.html"><span class="index-num">04</span><span class="index-title">SNAKE</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="plinko.html"><span class="index-num">05</span><span class="index-title">PLINKO</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="tictactoe.html"><span class="index-num">06</span><span class="index-title">TIC TAC TOE</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="type speed test/index.html"><span class="index-num">07</span><span class="index-title">TYPE SPEED TEST</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="time-machine.html"><span class="index-num">08</span><span class="index-title">TIME MACHINE</span><span class="index-arrow" aria-hidden="true">↗</span></a>
        </nav>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
</body>
</html>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node tools/check.mjs shell:index mobile:index fonts: theme: motion: index: a11y: focus:`
Expected: all PASS. If `mobile:index` fails on the hero, the hero is wrapping inside a word; confirm `h1` has `overflow-wrap: anywhere` and `.page--wide .hero` padding is `var(--s3)` — do not add `overflow-x: hidden` to `body` (that hides real overflow bugs).

- [ ] **Step 7: Eyeball**

Run: `node tools/check.mjs --shots` and open `tools/shots/index-1280-dark.png`, `index-375-dark.png`, `index-1280-light.png`. Check: title spans most of the width, rows are big with full-bleed rules, ticker at the bottom.

- [ ] **Step 8: Commit**

```bash
git add styles.css site.js index.html tools/check.mjs
git commit -m "Redesign: new design system, site.js, and landing page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Music pages (Music Player + Benevolent Inequality)

**Files:**
- Rewrite: `index1.html`, `benevolent-inequality.html`
- Modify: `styles.css` (append section), `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: `watchAudio(audio, status)`, `.loading`/`.loading-bar`, `.page-head`/`.meta`, shell markup (Task 1).
- Produces: `.artwork` and `.page audio` styles.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 2: music pages ----
shellTests('music');
shellTests('bi');

test('music:player', () => withPage('music', {}, async ({ page }) => {
    const r = await page.evaluate(() => ({
        meta: document.querySelector('.page-head .meta')?.textContent.trim(),
        source: !!document.querySelector('main audio#audioPlayer[controls] source[src="audio/canube.mp3"]'),
        mainVisible: getComputedStyle(document.querySelector('main')).display !== 'none',
    }));
    assert(r.meta === '01 / MUSIC PLAYER', 'meta line: ' + r.meta);
    assert(r.source, 'audio#audioPlayer with canube.mp3 source missing');
    assert(r.mainVisible, 'main content hidden while loading');
    await page.waitForSelector('#loading', { state: 'hidden', timeout: 8000 });
}));

test('bi:today', () => withPage('bi', { fixedTime: '2026-09-29T18:00:00Z' /* a Tuesday */ }, async ({ page }) => {
    const r = await page.evaluate(() => ({
        meta: document.querySelector('.page-head .meta').textContent.trim(),
        src: document.getElementById('audioPlayer').getAttribute('src'),
        art: document.querySelector('img.artwork').getAttribute('src'),
        border: getComputedStyle(document.querySelector('img.artwork')).borderTopWidth,
    }));
    assert(r.meta === '02 / TODAY: TUESDAY — HAD IT BACK TO', 'meta line: ' + r.meta);
    assert(r.src === 'audio/9:19-had-itback.mp3', 'Tuesday song wrong: ' + r.src);
    assert(r.art === 'images/Benevolent Inequality-artwork.jpeg', 'artwork src: ' + r.art);
    assert(r.border === '2px', 'artwork frame: ' + r.border);
}));

test('focus:audio-error', () => withPage('music', {
    route: ['**/*.mp3', route => route.fulfill({ status: 404, body: '' })],
}, async ({ page }) => {
    await page.waitForFunction(() => {
        const s = document.getElementById('loading');
        return !s.hidden && s.textContent.trim() === 'AUDIO UNAVAILABLE';
    }, null, { timeout: 5000 });
}));

test('focus:audio-play-hides-loading', () => withPage('bi', {
    route: ['**/*.mp3', () => { /* never respond: simulates a browser that won't preload (iOS) */ }],
    waitUntil: 'domcontentloaded',
}, async ({ page }) => {
    assert(await page.isVisible('#loading'), 'loading should show while audio is pending');
    await page.evaluate(() => document.getElementById('audioPlayer').dispatchEvent(new Event('play')));
    assert(await page.isHidden('#loading'), 'loading still visible after play');
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:music shell:bi mobile:music mobile:bi music: bi: focus:audio`
Expected: FAIL (old markup: no `.topbar`, no `#loading`).

- [ ] **Step 3: Append music styles to `styles.css`**

Append at the end of `styles.css`:

```css
/* ---- Music pages ---- */
.artwork {
    width: 100%;
    max-width: 560px;
    border: var(--rule) solid var(--border-color);
}

.page audio {
    display: block;
    width: 100%;
    max-width: 560px;
    margin-top: var(--s3);
}
```

- [ ] **Step 4: Rewrite `index1.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Can U Be</title>
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>CAN U BE</h1>
            <p class="meta">01 / MUSIC PLAYER</p>
        </div>

        <p class="loading" id="loading" role="status">LOADING<span class="loading-bar" aria-hidden="true"></span></p>
        <audio controls id="audioPlayer">
            <source src="audio/canube.mp3" type="audio/mpeg">
            Your browser does not support the audio element.
        </audio>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
    <script>
        watchAudio(document.getElementById('audioPlayer'), document.getElementById('loading'));
    </script>
</body>
</html>
```

- [ ] **Step 5: Rewrite `benevolent-inequality.html`**

The `songs` table and day logic are unchanged; the audio now gets its `src` directly (no empty `<source>`), so no spurious error fires before the real file is set.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BENEVOLENT INEQUALITY</title>
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>BENEVOLENT INEQUALITY</h1>
            <p class="meta">02 / TODAY: <span id="dayName"></span> — <span id="songTitle"></span></p>
        </div>

        <img class="artwork" src="images/Benevolent Inequality-artwork.jpeg" alt="BENEVOLENT INEQUALITY artwork">

        <p class="loading" id="loading" role="status">LOADING<span class="loading-bar" aria-hidden="true"></span></p>
        <audio controls id="audioPlayer">
            Your browser does not support the audio element.
        </audio>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
    <script>
        // Song rotation based on day of week
        // Updated to compressed mp3 assets with filename-safe naming (convert locally before deploying)
        const songs = [
            { title: "with love", file: "audio/with-love.mp3" },               // Sunday (0)
            { title: "my love, your love", file: "audio/my-love-your-love-demo.mp3" }, // Monday (1)
            { title: "had it back to", file: "audio/9:19-had-itback.mp3" },    // Tuesday (2)
            { title: "i can't do this", file: "audio/9:19-i-cant-do-this.mp3" }, // Wednesday (3)
            { title: "with love", file: "audio/with-love.mp3" },               // Thursday (4)
            { title: "my love, your love", file: "audio/my-love-your-love-demo.mp3" }, // Friday (5)
            { title: "had it back to", file: "audio/9:19-had-itback.mp3" }     // Saturday (6)
        ];

        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        function loadTodaysSong() {
            const dayIndex = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
            const currentSong = songs[dayIndex];

            document.getElementById('dayName').textContent = dayNames[dayIndex].toUpperCase();
            document.getElementById('songTitle').textContent = currentSong.title.toUpperCase();

            const audioPlayer = document.getElementById('audioPlayer');
            watchAudio(audioPlayer, document.getElementById('loading'));
            audioPlayer.src = currentSong.file;
        }

        loadTodaysSong();

        // Debug: Show what day and song should be playing
        console.log(`Today is ${dayNames[new Date().getDay()]}, playing: ${songs[new Date().getDay()].title}`);
    </script>
</body>
</html>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node tools/check.mjs shell:music shell:bi mobile:music mobile:bi music: bi: focus:audio`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add index1.html benevolent-inequality.html styles.css tools/check.mjs
git commit -m "Redesign: music player and Benevolent Inequality pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Busify countdown

**Files:**
- Rewrite: `busify.html`
- Modify: `styles.css` (append section), `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: `setMarqueeText(marquee, text)`, `.marquee`, `.stat-row`/`.stat`, shell (Task 1).
- Produces: `.band` style.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 3: Busify ----
shellTests('busify');

const countdownValues = page => page.$$eval('#countdown .stat-value', els => els.map(e => e.textContent.trim()));
const bandText = page => page.textContent('#launchBand .marquee-track');

test('busify:countdown', () => withPage('busify', { fixedTime: '2026-10-29T05:59:30Z' }, async ({ page }) => {
    await page.waitForTimeout(200);
    const values = await countdownValues(page);
    // 2026-10-31T07:00:00Z − 2026-10-29T05:59:30Z = 2d 1h 0m 30s
    assert(JSON.stringify(values) === '["02","01","00","30"]', 'countdown: ' + JSON.stringify(values));
    const labels = await page.$$eval('#countdown .stat-label', els => els.map(e => e.textContent.trim()));
    assert(JSON.stringify(labels) === '["DAYS","HRS","MIN","SEC"]', 'labels: ' + JSON.stringify(labels));
    assert((await bandText(page)).includes('LAUNCHING 10.31.26'), 'band missing launch text');
    const desc = await page.getAttribute('meta[name="description"]', 'content');
    assert(desc.includes('October 31, 2026'), 'meta description not updated: ' + desc);
}));

test('busify:live', () => withPage('busify', { fixedTime: '2026-11-01T00:00:00Z' }, async ({ page }) => {
    await page.waitForTimeout(200);
    assert(JSON.stringify(await countdownValues(page)) === '["00","00","00","00"]', 'expired digits not 00');
    const text = await bandText(page);
    assert(text.includes('LIVE NOW') && !text.includes('LAUNCHING'), 'band not switched to LIVE NOW: ' + text);
    await page.evaluate(() => document.fonts.ready); // let the one legitimate fonts.ready rebuild happen first
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__first = document.querySelector('#launchBand .marquee-track').firstElementChild; });
    await page.waitForTimeout(2500);
    const same = await page.evaluate(() => document.querySelector('#launchBand .marquee-track').firstElementChild === window.__first);
    assert(same, 'band is being rebuilt every tick after expiry');
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:busify mobile:busify busify:`
Expected: FAIL.

- [ ] **Step 3: Append band styles to `styles.css`**

```css
/* ---- Busify ---- */
.band {
    margin: 0 0 var(--s4);
    padding: var(--s2) 0;
    border-top: var(--rule) solid var(--border-color);
    border-bottom: var(--rule) solid var(--border-color);
    font-family: var(--font-display);
    font-size: clamp(32px, 7vw, 88px);
    line-height: 1.1;
}
```

- [ ] **Step 4: Rewrite `busify.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Busify Podcast - Can U Be</title>
    <meta name="description" content="Busify podcast - launching October 31, 2026. Deep conversations and insights.">
    <meta property="og:title" content="Busify Podcast">
    <meta property="og:description" content="Launching October 31, 2026 - Deep conversations and insights">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://bus10.github.io/busify.html">
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>BUSIFY</h1>
            <p class="meta">03 / PODCAST</p>
        </div>

        <div class="band marquee" id="launchBand">
            <div class="marquee-track"><span>LAUNCHING 10.31.26&nbsp;·&nbsp;</span></div>
        </div>

        <div class="stat-row" id="countdown">
            <div class="stat"><span class="stat-label">DAYS</span><span class="stat-value" id="days">00</span></div>
            <div class="stat"><span class="stat-label">HRS</span><span class="stat-value" id="hours">00</span></div>
            <div class="stat"><span class="stat-label">MIN</span><span class="stat-value" id="minutes">00</span></div>
            <div class="stat"><span class="stat-label">SEC</span><span class="stat-value" id="seconds">00</span></div>
        </div>

        <p class="copy">Deep conversations and insights.<br>Mark your calendar for the premiere.</p>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
    <script>
        // Countdown to October 31, 2026 at 12:00 AM MST (7:00 AM UTC)
        const launchDate = new Date('2026-10-31T07:00:00Z').getTime();
        const fields = ['days', 'hours', 'minutes', 'seconds'].map(id => document.getElementById(id));
        const pad = n => String(n).padStart(2, '0');
        let countdownInterval = null;

        // Returns true once the launch has passed (and the countdown is finished)
        function updateCountdown() {
            const distance = launchDate - Date.now();

            if (distance <= 0) {
                fields.forEach(el => { el.textContent = '00'; });
                setMarqueeText(document.getElementById('launchBand'), 'LIVE NOW\u00a0·\u00a0');
                clearInterval(countdownInterval);
                return true;
            }

            const parts = [
                Math.floor(distance / (1000 * 60 * 60 * 24)),
                Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
                Math.floor((distance % (1000 * 60)) / 1000)
            ];
            parts.forEach((value, i) => { fields[i].textContent = pad(value); });
            return false;
        }

        // Update immediately and then every second
        if (!updateCountdown()) countdownInterval = setInterval(updateCountdown, 1000);
    </script>
</body>
</html>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tools/check.mjs shell:busify mobile:busify busify:`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add busify.html styles.css tools/check.mjs
git commit -m "Redesign: Busify countdown to Oct 31 2026

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Canvas games (Snake + Plinko)

**Files:**
- Modify: `snake.html` (replace markup; four script edits), `plinko.html` (replace markup; three script edits)
- Modify: `styles.css` (append section), `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: `themeColors()`, `themechange` event, `.stat-row`, `.btn`, `.btn-row`, shell (Task 1).
- Produces: `.game`, `.game-canvas`, `.game-over` styles (Task 5 reuses `.game`).

Note: Snake redraws every animation frame and calls `getThemeColors()` each frame, so it picks up theme changes without a `themechange` listener. Plinko only draws while a ball moves, so it listens for `themechange`.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 4: canvas games ----
shellTests('snake');
shellTests('plinko');

test('snake:play', () => withPage('snake', {}, async ({ page }) => {
    assert(await page.evaluate(() => snake[0].x) === 10, 'snake should start at x=10');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
    assert(await page.evaluate(() => snake[0].x) > 10, 'snake did not move right');
    await page.evaluate(() => { food = { x: snake[0].x + 1, y: snake[0].y }; });
    await page.waitForTimeout(250);
    assert((await page.textContent('#score')).trim() === '10', 'score did not increase after eating');
}));

test('snake:game-over', () => withPage('snake', {}, async ({ page }) => {
    assert(await page.isHidden('#gameOver'), 'game over visible at start');
    await page.evaluate(() => gameOver());
    assert(await page.isVisible('#gameOver'), 'game over not shown');
    await page.keyboard.press('Space');
    assert(await page.isHidden('#gameOver'), 'space did not restart');
}));

test('snake:ink', () => withPage('snake', {}, async ({ page }) => {
    await page.waitForTimeout(200);
    assert(await isGrayscale(page, '#gameCanvas'), 'snake canvas has non-gray pixels (red apple?)');
}));

test('snake:theme-redraw', () => withPage('snake', {}, async ({ page }) => {
    await page.evaluate(() => { food = { x: 0, y: 0 }; }); // keep the bottom-right corner empty
    await page.waitForTimeout(100);
    assert(JSON.stringify(await pixel(page, '#gameCanvas', 399, 399)) === '[0,0,0]', 'dark background not black');
    await page.click('.theme-toggle');
    await page.waitForTimeout(100);
    assert(JSON.stringify(await pixel(page, '#gameCanvas', 399, 399)) === '[255,255,255]', 'canvas did not redraw light');
}));

test('plinko:play', () => withPage('plinko', {}, async ({ page }) => {
    const box = await page.locator('#plinkoCanvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 10);
    await page.waitForFunction(() => Number(document.getElementById('score').textContent) > 0, null, { timeout: 10000 });
    assert(await isGrayscale(page, '#plinkoCanvas'), 'plinko canvas has non-gray pixels');
    await page.click('button.btn:has-text("RESET")');
    assert((await page.textContent('#score')).trim() === '0', 'reset did not zero the score');
}));

test('plinko:theme-redraw', () => withPage('plinko', {}, async ({ page }) => {
    assert(JSON.stringify(await pixel(page, '#plinkoCanvas', 1, 1)) === '[0,0,0]', 'dark background not black');
    await page.click('.theme-toggle');
    await page.waitForTimeout(100);
    assert(JSON.stringify(await pixel(page, '#plinkoCanvas', 1, 1)) === '[255,255,255]', 'plinko did not redraw on themechange');
}));

test('plinko:font', () => withPage('plinko', {}, async ({ page }) => {
    const font = await page.evaluate(() => ctx.font);
    assert(font.includes('JetBrains Mono'), 'slot labels not in JetBrains Mono: ' + font);
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:snake shell:plinko mobile:snake mobile:plinko snake: plinko:`
Expected: FAIL (`snake:ink` fails on the red apple; shell tests fail on old markup).

- [ ] **Step 3: Append game styles to `styles.css`**

```css
/* ---- Games ---- */
.game {
    max-width: 400px;
}

.game .stat-row {
    margin-top: 0;
}

.game-canvas {
    display: block;
    width: 100%;
    height: auto;
    border: var(--rule) solid var(--border-color);
}

.game-over {
    margin-top: var(--s3);
    font-weight: 700;
}
```

- [ ] **Step 4: Replace Snake's markup**

In `snake.html`, replace everything from line 1 through `    <script src="theme.js"></script>` (original lines 1–37) with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Snake Game - Can U Be</title>
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>SNAKE</h1>
            <p class="meta">04 / ARROW KEYS OR WASD TO MOVE</p>
        </div>

        <div class="game">
            <div class="stat-row">
                <div class="stat"><span class="stat-label">SCORE</span><span class="stat-value" id="score">0</span></div>
            </div>
            <canvas id="gameCanvas" class="game-canvas" width="400" height="400"></canvas>
            <p id="gameOver" class="game-over" hidden>GAME OVER — PRESS SPACE TO RESTART</p>
        </div>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
```

- [ ] **Step 5: Edit Snake's script**

Four exact replacements in the remaining `<script>` block:

(a) Theme colors — replace:

```js
        // Get current theme colors
        function getThemeColors() {
            const isLight = document.body.getAttribute('data-theme') === 'light';
            return {
                bg: isLight ? '#fff' : '#000',
                fg: isLight ? '#000' : '#fff',
                apple: isLight ? '#e74c3c' : '#ff6b6b'  // Red apple in both themes
            };
        }
```

with:

```js
        // Get current theme colors (strict black/white, from site.js)
        function getThemeColors() {
            return themeColors();
        }
```

(b) Apple — replace:

```js
            // Draw apple with distinct color
            ctx.fillStyle = colors.apple;
            ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 2, gridSize - 2);
```

with:

```js
            // Draw apple as a hollow square so it reads apart from the solid snake
            ctx.strokeStyle = colors.fg;
            ctx.lineWidth = 2;
            ctx.strokeRect(food.x * gridSize + 1, food.y * gridSize + 1, gridSize - 4, gridSize - 4);
```

(c) In `gameOver()`, replace `gameOverElement.style.display = 'block';` with `gameOverElement.hidden = false;`

(d) In `resetGame()`, replace `gameOverElement.style.display = 'none';` with `gameOverElement.hidden = true;`

- [ ] **Step 6: Replace Plinko's markup**

In `plinko.html`, replace everything from line 1 through `    <script src="theme.js"></script>` (original lines 1–30) with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plinko - Can U Be</title>
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>PLINKO</h1>
            <p class="meta">05 / CLICK ABOVE THE BOARD TO DROP A BALL</p>
        </div>

        <div class="game">
            <div class="stat-row">
                <div class="stat"><span class="stat-label">SCORE</span><span class="stat-value" id="score">0</span></div>
            </div>
            <canvas id="plinkoCanvas" class="game-canvas" width="400" height="600"></canvas>
            <div class="btn-row">
                <button class="btn" type="button" onclick="resetGame()">RESET GAME</button>
            </div>
        </div>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
```

(This also fixes the old broken favicon path `favicon.ico`.)

- [ ] **Step 7: Edit Plinko's script**

(a) Replace:

```js
        // Get current theme colors
        function getThemeColors() {
            const isLight = document.body.getAttribute('data-theme') === 'light';
            return {
                bg: isLight ? '#fff' : '#000',
                fg: isLight ? '#000' : '#fff'
            };
        }
```

with:

```js
        // Get current theme colors (strict black/white, from site.js)
        function getThemeColors() {
            return themeColors();
        }
```

(b) Replace `ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';` with `ctx.font = '12px "JetBrains Mono", monospace';`

(c) Replace:

```js
        // Initialize and start
        initializeGame();
        draw();
```

with:

```js
        // Initialize and start
        initializeGame();
        draw();

        // Redraw when the theme flips or the web font arrives (board is static between drops)
        document.addEventListener('themechange', draw);
        document.fonts.ready.then(draw);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node tools/check.mjs shell:snake shell:plinko mobile:snake mobile:plinko snake: plinko:`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add snake.html plinko.html styles.css tools/check.mjs
git commit -m "Redesign: Snake and Plinko with theme-aware monochrome canvases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tic Tac Toe

**Files:**
- Modify: `tictactoe.html` (replace head + markup; script unchanged)
- Modify: `styles.css` (append section), `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: `.game`, `.btn`, `.btn-row`, shell (Tasks 1, 4).
- Produces: `.game-status`, `.game-board`, `.cell` styles (moved from the old inline `<style>`).

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 5: Tic Tac Toe ----
shellTests('ttt');

test('ttt:play', () => withPage('ttt', {}, async ({ page }) => {
    for (let turn = 0; turn < 5; turn++) {
        if (/WIN|DRAW/i.test(await page.textContent('#status'))) break;
        const idx = await page.evaluate(() => gameState.indexOf(''));
        await page.click(`.cell[data-index="${idx}"]`);
        await page.waitForTimeout(700); // bot replies after 500ms
    }
    const status = await page.textContent('#status');
    assert(/WIN|DRAW/i.test(status), 'round did not finish: ' + status);
    await page.click('#resetBtn');
    assert((await page.textContent('#status')) === 'Your Turn (X)', 'reset did not restore status');
    const empty = await page.$$eval('.cell', cells => cells.every(c => c.textContent === ''));
    assert(empty, 'reset did not clear cells');
}));

test('ttt:style', () => withPage('ttt', {}, async ({ page }) => {
    const r = await page.evaluate(() => ({
        cellFont: getComputedStyle(document.querySelector('.cell')).fontFamily,
        resetIsBtn: document.getElementById('resetBtn').classList.contains('btn'),
    }));
    assert(r.cellFont.includes('Anton'), 'cells not in Anton: ' + r.cellFont);
    assert(r.resetIsBtn, '#resetBtn is not a .btn');
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:ttt mobile:ttt ttt:`
Expected: FAIL (`shell:ttt` on inline `<style>`/old chrome, `ttt:style` on font).

- [ ] **Step 3: Append tic-tac-toe styles to `styles.css`**

```css
/* ---- Tic Tac Toe ---- */
.game-status {
    min-height: 1.5em;
    margin-bottom: var(--s3);
    font-size: 15px;
    font-weight: 700;
}

.game-board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--rule);
    background: var(--border-color);
    border: var(--rule) solid var(--border-color);
}

.cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-color);
    color: var(--text-color);
    font-family: var(--font-display);
    font-size: clamp(48px, 14vw, 96px);
    line-height: 1;
}

.cell:hover:not(.taken) {
    background: var(--text-color);
    color: var(--bg-color);
}

.cell.taken {
    cursor: not-allowed;
}

.cell:focus-visible {
    outline-offset: -6px;
}
```

(The old `.player-o { opacity: 0.7 }` rule is intentionally dropped: opacity on the cell also faded its background, and X/O are already distinct glyphs.)

- [ ] **Step 4: Replace the head and markup**

In `tictactoe.html`, replace everything from line 1 through `    <script src="theme.js"></script>` (original lines 1–125) with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tic Tac Toe - Can U Be</title>
    <meta name="description" content="Play Tic Tac Toe in brutalist style">
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>TIC TAC TOE</h1>
            <p class="meta">06 / YOU ARE X, BOT IS O</p>
        </div>

        <div class="game">
            <p class="game-status" id="status">Your Turn (X)</p>

            <div class="game-board" id="board">
                <button class="cell" type="button" data-index="0"></button>
                <button class="cell" type="button" data-index="1"></button>
                <button class="cell" type="button" data-index="2"></button>
                <button class="cell" type="button" data-index="3"></button>
                <button class="cell" type="button" data-index="4"></button>
                <button class="cell" type="button" data-index="5"></button>
                <button class="cell" type="button" data-index="6"></button>
                <button class="cell" type="button" data-index="7"></button>
                <button class="cell" type="button" data-index="8"></button>
            </div>

            <div class="btn-row">
                <button class="btn" type="button" id="resetBtn">RESET GAME</button>
            </div>
        </div>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
```

The following `<script>` block (game logic) stays exactly as it is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tools/check.mjs shell:ttt mobile:ttt ttt:`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add tictactoe.html styles.css tools/check.mjs
git commit -m "Redesign: Tic Tac Toe, styles moved into styles.css

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Type Speed Test

**Files:**
- Rewrite: `type speed test/index.html`
- Modify: `type speed test/script.js:379-380`
- Delete: `type speed test/styles.css`
- Modify: `styles.css` (append section), `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: `.btn`/`.is-active`, `.btn-row`, `.stat-row`, shell (Task 1). Script keeps selecting `.length-btn`, `#wpm`, `#accuracy`, `#timer`, `#wordsContainer`, `#resetBtn`, `.instruction-text`, `.test-area`, `.finished`.
- Produces: `.test-area`, `.words-container`, `.word`, `.char`, `.instruction-text`, `.finished` styles.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 6: Type Speed Test ----
shellTests('type');

test('type:buttons', () => withPage('type', {}, async ({ page, requests }) => {
    assert(!requests.some(u => u.includes('type%20speed%20test/styles.css')), 'old type test stylesheet still loaded');
    const isActive = sel => page.$eval(sel, e => e.classList.contains('btn') && e.classList.contains('is-active'));
    assert(await isActive('.length-btn[data-length="30"]'), 'SHORT should start as .btn.is-active');
    await page.click('.length-btn[data-length="60"]');
    assert(await isActive('.length-btn[data-length="60"]'), 'MEDIUM not active after click');
    assert(!(await isActive('.length-btn[data-length="30"]')), 'SHORT still active after switching');
    assert((await page.textContent('#timer')).trim() === '60', 'timer did not switch to 60');
    const labels = await page.$$eval('.stat-row .stat-label', els => els.map(e => e.textContent.trim()));
    assert(JSON.stringify(labels) === '["WPM","ACCURACY","TIME"]', 'stat labels: ' + JSON.stringify(labels));
}));

test('type:run', () => withPage('type', { installClock: true }, async ({ page }) => {
    await page.keyboard.type('abc ');
    await page.clock.runFor(31000);
    assert(await page.locator('.finished').count() === 1, 'results panel not shown after a 30s run');
}));

test('focus:type-case', () => withPage('type', {}, async ({ page }) => {
    const tt = await page.$eval('.words-container', e => getComputedStyle(e).textTransform);
    assert(tt === 'none', 'words are being uppercased (text-transform: ' + tt + ')');
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:type mobile:type type: focus:type`
Expected: FAIL.

- [ ] **Step 3: Append type test styles to `styles.css`**

```css
/* ---- Type Speed Test ---- */
.test-area {
    margin: var(--s4) 0;
}

.words-container {
    min-height: 120px;
    padding: var(--s4);
    border: var(--rule) solid var(--border-color);
    font-size: 18px;
    line-height: 1.8;
    letter-spacing: 0.02em;
    text-transform: none; /* show words exactly as they must be typed */
}

.word {
    display: inline-block;
    margin-right: 0.6em;
}

.word.current {
    box-shadow: inset 0 calc(-1 * var(--rule)) 0 var(--text-color);
}

.char.incorrect {
    background: var(--text-color);
    color: var(--bg-color);
}

.instruction-text {
    margin-top: var(--s3);
    font-size: 11px;
    opacity: var(--muted);
}

.instruction-text.active {
    visibility: hidden;
}

.finished {
    margin-bottom: var(--s4);
    padding: var(--s4);
    border: var(--rule) solid var(--border-color);
}

.finished h2 {
    margin-bottom: var(--s3);
    font-family: var(--font-display);
    font-size: clamp(32px, 7vw, 64px);
    font-weight: 400;
    line-height: 1;
}

.finished p {
    margin: var(--s1) 0;
}

@media (max-width: 600px) {
    .words-container {
        padding: var(--s3);
        font-size: 16px;
    }
}
```

- [ ] **Step 4: Rewrite `type speed test/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Type Speed Test - Can U Be</title>
    <link rel="icon" href="../images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="../styles.css">
</head>
<body>
    <header class="topbar">
        <a href="../index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="../index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <div class="page-head">
            <h1 data-scramble>TYPE SPEED TEST</h1>
            <p class="meta">07 / TYPE THE WORDS AS THEY APPEAR</p>
        </div>

        <div class="btn-row">
            <button class="btn length-btn is-active" type="button" data-length="30">SHORT (30S)</button>
            <button class="btn length-btn" type="button" data-length="60">MEDIUM (60S)</button>
            <button class="btn length-btn" type="button" data-length="120">LONG (120S)</button>
        </div>

        <div class="stat-row">
            <div class="stat"><span class="stat-label">WPM</span><span class="stat-value" id="wpm">0</span></div>
            <div class="stat"><span class="stat-label">ACCURACY</span><span class="stat-value" id="accuracy">100%</span></div>
            <div class="stat"><span class="stat-label">TIME</span><span class="stat-value" id="timer">30</span></div>
        </div>

        <div class="test-area">
            <div class="words-container" id="wordsContainer"></div>
            <p class="instruction-text">START TYPING TO BEGIN...</p>
        </div>

        <div class="btn-row">
            <button class="btn" type="button" id="resetBtn">START AGAIN</button>
        </div>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="../site.js"></script>
    <script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 5: Edit `type speed test/script.js`**

Replace:

```js
        lengthButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
```

with:

```js
        lengthButtons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
```

- [ ] **Step 6: Delete the old stylesheet**

```bash
git rm "type speed test/styles.css"
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node tools/check.mjs shell:type mobile:type type: focus:type`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add "type speed test/index.html" "type speed test/script.js" styles.css tools/check.mjs
git commit -m "Redesign: Type Speed Test on shared styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Time Machine + 404

**Files:**
- Rewrite: `time-machine.html`, `404.html`
- Modify: `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: `.index-row` family, `.page--wide`, `.hero`, `.btn`, shell (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 7: Time Machine + 404 ----
shellTests('tm');
shellTests('notfound');

test('tm:rows', () => withPage('tm', {}, async ({ page }) => {
    const rows = await page.$$eval('.index-row', els => els.map(e => [
        e.getAttribute('href'),
        e.querySelector('.index-num').textContent.trim(),
        e.querySelector('.index-title-text').textContent.trim(),
    ]));
    const expected = [
        ['time-machine/CUB-V1/index.html', 'V1', 'AUGUST 2024'],
        ['time-machine/CUB-V2/index.html', 'V2', 'SEPTEMBER 2024'],
        ['time-machine/CUB-V3/index.html', 'V3', 'OCTOBER 2024'],
    ];
    assert(JSON.stringify(rows) === JSON.stringify(expected), 'rows: ' + JSON.stringify(rows));
}));

test('notfound:page', () => withPage('notfound', {}, async ({ page }) => {
    const r = await page.evaluate(() => ({
        css: !!document.querySelector('link[rel="stylesheet"][href="/styles.css"]'),
        js: !!document.querySelector('script[src="/site.js"]'),
        icon: !!document.querySelector('link[rel="icon"][href="/images/favicon.ico"]'),
        home: !!document.querySelector('a.btn[href="/index.html"]'),
    }));
    assert(r.css && r.js && r.icon, '404 must use root-absolute asset paths: ' + JSON.stringify(r));
    assert(r.home, '404 needs a .btn back to /index.html');
    await page.waitForTimeout(900);
    assert((await page.textContent('h1')) === '404', '404 heading did not settle');
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs shell:tm shell:notfound mobile:tm mobile:notfound tm: notfound:`
Expected: FAIL.

- [ ] **Step 3: Rewrite `time-machine.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Machine</title>
    <link rel="icon" href="images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <a href="index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page page--wide">
        <div class="page-head">
            <h1 data-scramble>TIME MACHINE</h1>
            <p class="meta">08 / PAST VERSIONS OF THIS SITE</p>
        </div>

        <nav class="index" aria-label="Archived versions">
            <a class="index-row" href="time-machine/CUB-V1/index.html"><span class="index-num">V1</span><span class="index-title">AUGUST 2024</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="time-machine/CUB-V2/index.html"><span class="index-num">V2</span><span class="index-title">SEPTEMBER 2024</span><span class="index-arrow" aria-hidden="true">↗</span></a>
            <a class="index-row" href="time-machine/CUB-V3/index.html"><span class="index-num">V3</span><span class="index-title">OCTOBER 2024</span><span class="index-arrow" aria-hidden="true">↗</span></a>
        </nav>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="site.js"></script>
</body>
</html>
```

- [ ] **Step 4: Rewrite `404.html`**

GitHub Pages serves this file at any missing URL depth, so every path is root-absolute.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 Not Found</title>
    <link rel="icon" href="/images/favicon.ico" type="image/x-icon">
    <script>try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <header class="topbar">
        <a href="/index.html" class="topbar-home">CAN U BE</a>
        <span class="live-dot" aria-hidden="true">●</span>
        <time class="clock" aria-label="Current time">00:00:00</time>
        <a href="/index.html" class="topbar-back">← INDEX</a>
        <button class="theme-toggle" type="button" onclick="toggleTheme()" aria-label="Toggle theme">[LIGHT]</button>
    </header>

    <main class="page">
        <h1 class="hero" data-scramble>404</h1>
        <p class="meta">PAGE NOT FOUND</p>
        <div class="btn-row">
            <a class="btn" href="/index.html">BACK TO INDEX</a>
        </div>
    </main>

    <footer class="ticker marquee" aria-label="Website made by @bus0">
        <div class="marquee-track"><span>WEBSITE MADE BY @BUS0&nbsp;·&nbsp;</span><span>CAN U BE&nbsp;·&nbsp;</span></div>
    </footer>

    <script src="/site.js"></script>
</body>
</html>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tools/check.mjs shell:tm shell:notfound mobile:tm mobile:notfound tm: notfound:`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add time-machine.html 404.html tools/check.mjs
git commit -m "Redesign: Time Machine index and 404 page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Cleanup, sitemap, docs, full verification

**Files:**
- Delete: `theme.js`
- Modify: `sitemap.xml`, `CLAUDE.md`, `tools/check.mjs` (append tests)

**Interfaces:**
- Consumes: everything above.
- Produces: final branch state.

- [ ] **Step 1: Write the failing tests**

Insert above `// ==== RUNNER ====`:

```js
// ---- Task 8: cleanup ----
test('cleanup:theme-js-removed', async () => {
    assert(!existsSync(path.join(ROOT, 'theme.js')), 'theme.js still exists');
    assert(!existsSync(path.join(ROOT, 'type speed test', 'styles.css')), 'type speed test/styles.css still exists');
});

test('cleanup:sitemap', async () => {
    const xml = readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    const blocks = xml.match(/<url>[\s\S]*?<\/url>/g);
    for (const block of blocks) {
        const lastmod = block.match(/<lastmod>([^<]*)<\/lastmod>/)[1];
        if (block.includes('/time-machine/')) assert(lastmod.startsWith('2024-'), 'archive lastmod changed: ' + block);
        else assert(lastmod === today, 'live page lastmod not updated: ' + block.match(/<loc>([^<]*)/)[1]);
    }
});

test('archive:untouched', async () => {
    execSync('git diff --quiet 12364c0 -- time-machine', { cwd: ROOT });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tools/check.mjs cleanup: archive:`
Expected: `cleanup:theme-js-removed` and `cleanup:sitemap` FAIL; `archive:untouched` PASS.

- [ ] **Step 3: Confirm nothing references `theme.js`, then delete it**

```bash
grep -rn "theme.js" --include="*.html" . | grep -v "^./time-machine/" ; git rm theme.js
```

Expected: the grep prints nothing before the `git rm` runs.

- [ ] **Step 4: Bump sitemap `lastmod` for live pages**

```bash
python3 - <<'EOF'
import datetime, pathlib, re
p = pathlib.Path('sitemap.xml')
today = datetime.date.today().isoformat()
def bump(m):
    block = m.group(0)
    if '/time-machine/' in block:
        return block
    return re.sub(r'<lastmod>[^<]*</lastmod>', f'<lastmod>{today}</lastmod>', block)
p.write_text(re.sub(r'<url>.*?</url>', bump, p.read_text(), flags=re.S))
EOF
```

- [ ] **Step 5: Update `CLAUDE.md`**

Replace the whole "## Development Workflow" and "## Architecture & Conventions" sections with:

```markdown
## Development Workflow

- **Preview**: serve the repo root (`python3 -m http.server 8765 --bind 127.0.0.1`) and open `http://127.0.0.1:8765/`. No compile/build step. (`404.html` uses root-absolute paths, so it only renders correctly when served from the site root.)
- **Verification**: `tools/check.mjs` is a Playwright suite (dev-only; `tools/` has its own `package.json`, the site itself has none). First time: `cd tools && npm install && npx playwright install chromium`. With the server running: `node tools/check.mjs` (all), `node tools/check.mjs shell:snake theme:` (by prefix), `node tools/check.mjs --shots` (screenshots of every page at 1280/375 in both themes into gitignored `tools/shots/`). Needs network for Google Fonts.
- **Deployment**: pushing to `main` on GitHub Pages is the deploy mechanism (site root is repo root, per `sitemap.xml`/`robots.txt` referencing `https://bus10.github.io/`).

## Architecture & Conventions

- **Page-per-file**: each route is its own `.html` file (`index.html`, `index1.html`, `benevolent-inequality.html`, `busify.html`, `snake.html`, `plinko.html`, `tictactoe.html`, `type speed test/index.html`, `time-machine.html`, `404.html`). No router/framework.
- **Shared shell** (static markup copied into every page — copy it from `snake.html` when adding a page):
  1. In `<head>`: favicon, the one-line theme snippet `<script>try{if(localStorage.getItem('theme')==='light')...}</script>` (must precede the stylesheets to avoid a theme flash), Google Fonts preconnects + `Anton` / `JetBrains Mono` link, then `styles.css`.
  2. `<header class="topbar">`: home link, `.live-dot`, `<time class="clock">`, `.topbar-back` (inner pages only), `.theme-toggle` calling `toggleTheme()`.
  3. `<main class="page">` (or `.page.page--wide` for full-bleed index layouts) starting with `.page-head` → `h1[data-scramble]` + `.meta` line (`NN / DESCRIPTION`).
  4. `<footer class="ticker marquee">` with the "WEBSITE MADE BY @BUS0" `.marquee-track`.
  5. `<script src="site.js"></script>` before any page script.
- **`site.js`** exposes `toggleTheme()`, `themeColors()` (current `{bg, fg}` for canvas drawing), `setMarqueeText(marqueeEl, text)`, `watchAudio(audioEl, loadingEl)`, and dispatches a `themechange` event on `document`. On load it auto-wires the clock, `.marquee > .marquee-track` loops, `.index-row` hover marquees, `[data-scramble]` headings, and the inverting cursor (fine pointers only). Everything decorative is skipped under `prefers-reduced-motion`.
- **Theming**: `data-theme="light"` on `<html>` (dark = no attribute), persisted in `localStorage` key `theme`. Strict black/white: all color comes from `--bg-color` / `--text-color` / `--border-color` in `styles.css`. Never hardcode colors in markup or page scripts — canvases call `themeColors()` and redraw on `themechange` if they don't redraw every frame.
- **Type**: `Anton` for display (h1, index rows, stat values), `JetBrains Mono` for everything else. Body text is uppercase by default; content that must keep its case (e.g. type test words) sets `text-transform: none`.
- **Styling**: `styles.css` is the only stylesheet — tokens, base, shell, components (`.btn`, `.stat-row`/`.stat`, `.index-row`, `.marquee`, `.loading`), then page sections. No inline `<style>` blocks. Motion uses `linear`/`steps()` only; no color transitions (theme switches are hard cuts). Breakpoint `600px`.
- **Games** (`snake.html`, `tictactoe.html`, `plinko.html`): self-contained vanilla JS at the bottom of the file; each reimplements its own loop. Style changes must not alter rules/speeds/scoring.
- **Archived snapshots**: `time-machine/CUB-V1`, `CUB-V2`, `CUB-V3` are frozen, self-contained copies of old versions. Do not "fix" or modernize them.
- **`sitemap.xml`**: manually maintained; add an entry (with `lastmod`) whenever a new public page is added, matching the existing `priority`/`changefreq` conventions (top-level pages weekly/monthly, archived versions `never`).
- **Assets**: images in `images/`, audio in `audio/` (raw `.wav` masters are gitignored — only compressed deliverables like `.mp3` are committed, per `.gitignore`).
```

Also in the "## Project Overview" paragraph, replace "There is no build system, package manager, bundler, or backend — every page is a standalone `.html` file with inline or same-directory `<script>`/`<link>` tags, deployed as-is." with "There is no build system, bundler, or backend — every page is a standalone `.html` file sharing `styles.css` and `site.js`, deployed as-is. The only package manifest is the dev-only verification harness in `tools/`."

- [ ] **Step 6: Run the full suite**

Run: `node tools/check.mjs`
Expected: every test PASS, final line `N/N passed`.

- [ ] **Step 7: Visual pass**

Run: `node tools/check.mjs --shots` and review all 40 images in `tools/shots/`. Check in each: no clipped headings, rules edge-to-edge, readable in both themes, games visible above the fold at 375px wide except Plinko's lower board.

- [ ] **Step 8: Commit**

```bash
git add -A theme.js sitemap.xml CLAUDE.md tools/check.mjs
git commit -m "Redesign cleanup: remove theme.js, bump sitemap, document new system

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec refinements made while planning

These are small, deliberate deviations from the spec text — flag in review if unwanted:

- `site.js` exposes a fourth global, `watchAudio()`, so both music pages share one loading-status implementation. It hides the loader on `loadedmetadata`/`canplay`/`play` too (not only `canplaythrough`), because iOS Safari never preloads audio and the loader would otherwise hang forever; on error it shows `AUDIO UNAVAILABLE`.
- The loading indicator is a CSS stepped fill bar next to `LOADING` rather than literal `▮▯` characters (same look, no text churn for screen readers).
- Snake needs no `themechange` listener because it already redraws every frame; Plinko gets one.
- Tic-tac-toe's O no longer renders at 70% opacity (it faded the cell background too).
- The Benevolent Inequality `<audio>` gets its `src` set directly instead of via an empty `<source>`, avoiding a spurious error event before the real file loads.
- Type test words render with `text-transform: none` so the displayed case matches what the user types.
