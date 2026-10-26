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
    v3: 'v3.html',
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

test('motion:no-cursor', () => withPage('index', {}, async ({ page }) => {
    await page.mouse.move(200, 300);
    assert(await page.locator('.cursor').count() === 0, 'custom cursor element should not exist');
}));

test('index:rows', () => withPage('index', {}, async ({ page }) => {
    const rows = await page.$$eval('.index-row', els => els.map(e => [
        e.getAttribute('href'),
        e.querySelector('.index-num').textContent.trim(),
        e.querySelector('.index-title-text').textContent.trim(),
    ]));
    const expected = [
        ['v3.html', '00', 'A NOTE ON V3'],
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
    await page.locator('.index-row').nth(4).scrollIntoViewIfNeeded();
    const box = await page.locator('.index-row').nth(4).boundingBox();
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

// Silent mono 16-bit PCM WAV, small enough to decode instantly
function wav(seconds = 0.3, rate = 8000) {
    const n = Math.round(seconds * rate);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    return b;
}
const wavFile = name => ({ name, mimeType: 'audio/wav', buffer: wav() });

// Snapshot of the upload player's visible state
const playerState = page => page.evaluate(() => {
    const audio = document.getElementById('audioPlayer');
    return {
        rows: [...document.querySelectorAll('#queue .queue-item')].map(b => [...b.children].map(c => c.textContent).join(' ')),
        current: [...document.querySelectorAll('#queue .queue-item')].findIndex(b => b.getAttribute('aria-current') === 'true'),
        errors: [...document.querySelectorAll('#queue .queue-item')].map(b => b.classList.contains('is-error')),
        status: document.getElementById('playerStatus').textContent.trim(),
        note: document.getElementById('playerNote').hidden ? '' : document.getElementById('playerNote').textContent.trim(),
        audioHidden: audio.hidden,
        src: audio.getAttribute('src') || '',
        prev: document.getElementById('prevBtn').disabled,
        next: document.getElementById('nextBtn').disabled,
        controlsHidden: document.getElementById('playerControls').hidden,
    };
});

test('music:player', () => withPage('music', {}, async ({ page, requests }) => {
    const r = await page.evaluate(() => ({
        meta: document.querySelector('.page-head .meta')?.textContent.trim(),
        input: !!document.querySelector('main .dropzone input#fileInput[type="file"][accept="audio/*"][multiple]'),
        label: document.querySelector('.dropzone')?.textContent.replace(/\s+/g, ' ').trim(),
        mainVisible: getComputedStyle(document.querySelector('main')).display !== 'none',
    }));
    assert(r.meta === '01 / MUSIC PLAYER', 'meta line: ' + r.meta);
    assert(r.input, 'file input (audio/*, multiple) inside .dropzone missing');
    assert(r.label.includes('ADD FILES'), 'dropzone label: ' + r.label);
    assert(r.mainVisible, 'main content hidden');
    const s = await playerState(page);
    assert(s.status === 'NO FILES LOADED', 'empty status: ' + s.status);
    assert(s.rows.length === 0 && s.audioHidden && s.controlsHidden, 'empty state should hide audio + controls');
    assert(!requests.some(u => u.endsWith('.mp3')), 'page still requests a hosted mp3');
}));

test('music:queue', () => withPage('music', {}, async ({ page, errors }) => {
    await page.setInputFiles('#fileInput', [wavFile('First Song.wav'), wavFile('second.WAV')]);
    let s = await playerState(page);
    assert(JSON.stringify(s.rows) === '["01 First Song","02 second"]', 'rows: ' + JSON.stringify(s.rows));
    assert(s.current === 0, 'first track should be current, got ' + s.current);
    assert(s.src.startsWith('blob:'), 'audio src should be an object URL: ' + s.src);
    assert(!s.audioHidden && !s.controlsHidden, 'audio/controls should show once loaded');
    assert(s.status === 'NOW PLAYING: First Song', 'status: ' + s.status);
    assert(s.prev && !s.next, 'prev disabled / next enabled on first track');
    const rowCase = await page.$eval('#queue .queue-name', el => getComputedStyle(el).textTransform);
    assert(rowCase === 'none', 'queue names must keep their case');

    await page.click('#nextBtn');
    s = await playerState(page);
    assert(s.current === 1 && !s.prev && s.next, 'NEXT should move to track 2: ' + JSON.stringify(s));

    await page.evaluate(() => document.getElementById('audioPlayer').dispatchEvent(new Event('ended')));
    s = await playerState(page);
    assert(s.current === 1, 'ending the last track should not wrap');

    await page.click('#queue li:first-child .queue-item');
    assert((await playerState(page)).current === 0, 'clicking a row should jump to it');
    await page.evaluate(() => document.getElementById('audioPlayer').dispatchEvent(new Event('ended')));
    assert((await playerState(page)).current === 1, 'ended should auto-advance');

    await page.setInputFiles('#fileInput', [wavFile('third.wav')]);
    s = await playerState(page);
    assert(s.rows.length === 3 && s.rows[2] === '03 third' && s.current === 1, 'adding should append without jumping: ' + JSON.stringify(s));

    await page.click('#clearBtn');
    s = await playerState(page);
    assert(s.rows.length === 0 && s.audioHidden && s.controlsHidden && s.src === '', 'CLEAR should reset: ' + JSON.stringify(s));
    assert(s.status === 'NO FILES LOADED', 'status after clear: ' + s.status);
    assert(errors.length === 0, 'console errors: ' + errors.join(' | '));
}));

test('music:bad-file', () => withPage('music', {}, async ({ page }) => {
    await page.setInputFiles('#fileInput', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
    let s = await playerState(page);
    assert(s.rows.length === 0, 'non-audio file should not be queued');
    assert(s.note === "CAN'T PLAY: notes.txt", 'note: ' + s.note);

    await page.setInputFiles('#fileInput', [
        { name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('definitely not audio'.repeat(50)) },
        wavFile('good.wav'),
    ]);
    await page.waitForFunction(() => document.querySelector('#queue li:nth-child(2) .queue-item')?.getAttribute('aria-current') === 'true', null, { timeout: 5000 });
    s = await playerState(page);
    assert(s.errors[0] && !s.errors[1], 'broken track should be marked: ' + JSON.stringify(s.errors));
    assert(s.note === "CAN'T PLAY: broken", 'note: ' + s.note);
}));

test('music:drop', () => withPage('music', {}, async ({ page }) => {
    const r = await page.evaluate(() => {
        const zone = document.querySelector('.dropzone');
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(64)], 'dropped.wav', { type: 'audio/wav' }));
        zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
        const over = zone.classList.contains('is-dragover');
        zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return { over, after: zone.classList.contains('is-dragover') };
    });
    assert(r.over && !r.after, 'dragover state should toggle: ' + JSON.stringify(r));
    const s = await playerState(page);
    assert(JSON.stringify(s.rows) === '["01 dropped"]', 'dropped rows: ' + JSON.stringify(s.rows));
}));

test('music:long-name-mobile', () => withPage('music', { width: 375 }, async ({ page }) => {
    await page.setInputFiles('#fileInput', [wavFile('an_extremely_long_file_name_without_any_spaces_at_all_from_a_daw_bounce_final_v12.wav')]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `horizontal overflow of ${overflow}px with a long file name`);
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

test('focus:audio-error', () => withPage('bi', {
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

test('busify:countdown', () => withPage('busify', { fixedTime: '2026-12-23T05:59:30Z' }, async ({ page }) => {
    await page.waitForTimeout(200);
    const values = await countdownValues(page);
    // 2026-12-25T07:00:00Z − 2026-12-23T05:59:30Z = 2d 1h 0m 30s
    assert(JSON.stringify(values) === '["02","01","00","30"]', 'countdown: ' + JSON.stringify(values));
    const labels = await page.$$eval('#countdown .stat-label', els => els.map(e => e.textContent.trim()));
    assert(JSON.stringify(labels) === '["DAYS","HRS","MIN","SEC"]', 'labels: ' + JSON.stringify(labels));
    assert((await bandText(page)).includes('LAUNCHING 12.25.26'), 'band missing launch text');
    const desc = await page.getAttribute('meta[name="description"]', 'content');
    assert(desc.includes('December 25, 2026'), 'meta description not updated: ' + desc);
}));

test('busify:live', () => withPage('busify', { fixedTime: '2026-12-26T00:00:00Z' }, async ({ page }) => {
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
shellTests('v3');

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

// Snapshots stay frozen, except V1/V2 index.html, which swap the removed song for a file picker
test('archive:untouched', async () => {
    execSync("git diff --quiet 12364c0 -- time-machine ':!time-machine/CUB-V1/index.html' ':!time-machine/CUB-V2/index.html' ':!time-machine/*/canube.mp3'", { cwd: ROOT });
});

test('archive:song-removed', async () => {
    for (const f of ['audio/canube.mp3', 'time-machine/CUB-V1/canube.mp3', 'time-machine/CUB-V2/canube.mp3']) {
        assert(!existsSync(path.join(ROOT, f)), f + ' still exists');
    }
});

for (const v of ['CUB-V1', 'CUB-V2']) {
    test(`archive:${v}-picker`, () => withPage(null, { url: `${BASE}time-machine/${v}/index.html` }, async ({ page, errors, requests }) => {
        assert(!requests.some(u => u.endsWith('.mp3')), 'still requests an mp3: ' + requests.filter(u => u.endsWith('.mp3')));
        assert(await page.isVisible('.container'), 'container hidden without the song');
        assert(await page.getAttribute('.song-note a', 'href') === '../../v3.html', 'note must link to v3.html');
        const noteOpacity = () => page.$eval('.song-note', e => getComputedStyle(e).opacity);
        await page.mouse.move(5, 795);
        assert(await noteOpacity() === '0', 'note should be hidden until hover');
        await page.hover('.container h1');
        assert(await noteOpacity() === '1', 'note should show on hover');
        await page.setInputFiles('#fileInput', wavFile('mine.wav'));
        await page.waitForFunction(() => document.querySelector('audio').src.startsWith('blob:'));
        assert(errors.length === 0, 'page errors: ' + errors.join(' | '));
    }));
    test(`archive:${v}-note-touch`, () => withPage(null, { url: `${BASE}time-machine/${v}/index.html`, width: 375, touch: true }, async ({ page }) => {
        const opacity = await page.$eval('.song-note', e => getComputedStyle(e).opacity);
        assert(opacity === '1', 'note must stay visible on touch devices (no hover)');
    }));
}

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

// ---- Audit fixes ----
test('audit:row-name-on-focus', () => withPage('index', {}, async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    const snap = await page.locator('nav.index').ariaSnapshot();
    assert(snap.includes('link "01 MUSIC PLAYER"'), 'focused row lost its accessible name:\n' + snap);
    const track = await page.locator('.index-row').first().locator('.marquee-track').evaluate(t => getComputedStyle(t).display);
    assert(track === 'inline-flex', 'focused row marquee not showing');
}));

test('audit:row-name-on-hover', () => withPage('index', {}, async ({ page }) => {
    await page.locator('.index-row').nth(1).hover();
    const snap = await page.locator('nav.index').ariaSnapshot();
    assert(snap.includes('link "02 BENEVOLENT INEQUALITY"'), 'hovered row lost its accessible name:\n' + snap);
}));

test('audit:motion-pause', () => withPage('index', {}, async ({ page }) => {
    assert(await page.textContent('.motion-toggle') === '[PAUSE]', 'motion toggle missing or mislabelled');
    await page.click('.motion-toggle');
    const r = await page.evaluate(() => ({
        attr: document.documentElement.dataset.motion,
        ticker: getComputedStyle(document.querySelector('.ticker .marquee-track')).animationPlayState,
        dot: getComputedStyle(document.querySelector('.live-dot')).animationPlayState,
        label: document.querySelector('.motion-toggle').textContent,
        saved: localStorage.getItem('motion'),
    }));
    assert(r.attr === 'paused' && r.ticker === 'paused' && r.dot === 'paused', 'pause did not stop motion: ' + JSON.stringify(r));
    assert(r.label === '[PLAY]' && r.saved === 'paused', 'pause state not labelled/saved: ' + JSON.stringify(r));
    await page.locator('.index-row').first().hover();
    assert(await page.locator('.index-row').first().locator('.index-title-text').isVisible(), 'row swapped to marquee while paused');
    await page.reload();
    assert(await page.getAttribute('html', 'data-motion') === 'paused', 'pause not restored on reload');
    assert(await page.textContent('h1') === 'CAN U BE', 'heading scrambled while paused');
}));

test('audit:no-motion-toggle-when-reduced', () => withPage('index', { reducedMotion: 'reduce' }, async ({ page }) => {
    assert(await page.locator('.motion-toggle').count() === 0, 'motion toggle shown under reduced motion');
}));

test('audit:toggle-label-in-name', () => withPage('index', {}, async ({ page }) => {
    const r = await page.evaluate(() => ({ label: document.querySelector('.theme-toggle').getAttribute('aria-label') }));
    assert(r.label === null, 'theme toggle aria-label overrides its visible text');
}));

test('audit:theme-color', () => withPage('index', {}, async ({ page }) => {
    const read = () => page.getAttribute('meta[name="theme-color"]', 'content');
    const dark = await read();
    await page.click('.theme-toggle');
    const light = await read();
    assert(dark === '#000' && light === '#fff', `theme-color not following theme: ${dark} -> ${light}`);
}));

test('audit:og-image', () => withPage('index', {}, async ({ page }) => {
    const src = await page.getAttribute('meta[property="og:image"]', 'content');
    assert(src.endsWith('/images/og.png') && existsSync(path.join(ROOT, 'images', 'og.png')), 'og:image missing: ' + src);
}));

for (const [key, file] of Object.entries(PAGES).filter(([k]) => k !== 'notfound')) {
    test(`release:meta:${key}`, () => {
        const html = readFileSync(path.join(ROOT, decodeURIComponent(file)), 'utf8');
        // Cloudflare serves clean URLs: foo.html -> /foo, dir/index.html -> /dir/
        const url = 'https://canube.com/' + (key === 'index' ? '' : file.replace(/index\.html$/, '').replace(/\.html$/, ''));
        for (const sel of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"'])
            assert(html.includes(`<meta ${sel}`), `${file}: missing ${sel}`);
        assert(html.includes(`<meta property="og:url" content="${url}">`), `${file}: og:url is not ${url}`);
        assert(html.includes(`<link rel="canonical" href="${url}">`), `${file}: canonical is not ${url}`);
        const img = html.match(/property="og:image" content="https:\/\/canube\.com\/([^"]+)"/)[1];
        assert(existsSync(path.join(ROOT, decodeURIComponent(img))), `${file}: og:image file missing: ${img}`);
    });
}

test('release:meta:notfound', () => {
    const html = readFileSync(path.join(ROOT, '404.html'), 'utf8');
    assert(html.includes('<meta name="description"') && html.includes('<meta name="robots" content="noindex">'), '404 needs description + noindex');
});

for (const key of ['index', 'snake']) {
    test(`audit:touch-targets:${key}`, () => withPage(key, { width: 375, touch: true }, async ({ page }) => {
        await page.waitForTimeout(300);
        const r = await page.evaluate(() => {
            const bar = document.querySelector('.topbar');
            const out = [...bar.querySelectorAll('a, button'), document.querySelector('.motion-toggle')].map(el => {
                const box = el.getBoundingClientRect();
                const after = getComputedStyle(el, '::after');
                const extra = after.content !== 'none' ? -parseFloat(after.top) - parseFloat(after.bottom) : 0;
                return [el.className, Math.round(box.height + extra)];
            });
            return { out, barH: Math.round(bar.getBoundingClientRect().height), overflow: bar.scrollWidth - bar.clientWidth };
        });
        assert(r.out.every(([, h]) => h >= 44), 'topbar targets under 44px: ' + JSON.stringify(r.out));
        assert(r.overflow <= 0, 'topbar overflows at 375px by ' + r.overflow);
        assert(r.barH <= 50, 'topbar wraps onto more than one line at 375px: ' + r.barH + 'px');
    }));
}

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
