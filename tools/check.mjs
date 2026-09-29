// Browser verification suite for the Can U Be redesign.
// Serves the repo root itself on a random localhost port (or set BASE to use another server).
// Run all checks:             node tools/check.mjs
// Run a subset by prefix:     node tools/check.mjs shell:index theme:
// Screenshots for eyeballing: node tools/check.mjs --shots   (writes tools/shots/*.png)
// Preview the site:           node tools/check.mjs --serve   (http://127.0.0.1:8765/)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let BASE = process.env.BASE;

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png',
    '.mp3': 'audio/mpeg', '.xml': 'application/xml', '.txt': 'text/plain',
};

// Minimal static file server for the repo root (like GitHub Pages, minus the 404 fallback)
function startServer(port) {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname);
        const file = path.join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel);
        if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
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
if (args.includes('--serve')) {
    await startServer(8765);
    console.log('Serving ' + ROOT + ' at http://127.0.0.1:8765/ (Ctrl+C to stop)');
    await new Promise(() => {});
}
const server = BASE ? null : await startServer(0);
if (server) BASE = `http://127.0.0.1:${server.address().port}/`;
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
