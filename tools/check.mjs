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
        ...(opts.touch ? { isMobile: true, hasTouch: true } : {}),
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

// ---- Task 8: cleanup ----
test('cleanup:theme-js-removed', async () => {
    assert(!existsSync(path.join(ROOT, 'theme.js')), 'theme.js still exists');
    assert(!existsSync(path.join(ROOT, 'type speed test', 'styles.css')), 'type speed test/styles.css still exists');
});

test('cleanup:sitemap', async () => {
    const xml = readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    const now = new Date(); // local date, matching the bump script's datetime.date.today()
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
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

// ---- Final review fixes ----
test('review:scramble-no-shift', () => withPage('type', { width: 375 }, async ({ page }) => {
    await page.waitForTimeout(900);
    const settled = await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().height);
    await page.hover('h1');
    const heights = await page.evaluate(async () => {
        const h = document.querySelector('h1');
        const out = [];
        for (let i = 0; i < 10; i++) {
            out.push(h.getBoundingClientRect().height);
            await new Promise(r => setTimeout(r, 40));
        }
        return out;
    });
    assert(heights.every(h => h === settled), `heading height shifts while scrambling: settled ${settled}, saw ${heights.join(',')}`);
}));

test('review:touch-no-sticky-hover', () => withPage('index', { width: 375, touch: true }, async ({ page }) => {
    await page.evaluate(() => document.querySelectorAll('.index-row').forEach(a => a.addEventListener('click', e => e.preventDefault())));
    await page.tap('.index-row >> nth=1');
    await page.waitForTimeout(100);
    const bg = await page.locator('.index-row').nth(1).evaluate(e => getComputedStyle(e).backgroundColor);
    assert(bg !== 'rgb(255, 255, 255)', 'tapped row stays inverted on a touch device: ' + bg);
}));

test('review:row-marquee-speed', () => withPage('index', {}, async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const speeds = await page.$$eval('.index-row .marquee-track', tracks => tracks.map(t => {
        t.style.display = 'inline-flex';
        const half = t.scrollWidth / 2;
        t.style.display = '';
        return Math.round(half / parseFloat(getComputedStyle(t).animationDuration));
    }));
    assert(speeds.every(s => s > 0 && s <= 100), 'row marquee speeds (px/s) should be ~80: ' + speeds.join(','));
}));

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
