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
                unit.textContent = text + ' · ';
                track.appendChild(unit);
            }
            title.appendChild(track);
            row.classList.add('has-marquee');
        });
        setRowMarqueeSpeeds();
        if (document.fonts) document.fonts.ready.then(setRowMarqueeSpeeds);
    }

    // Row tracks are display:none until hover, so measure them briefly shown; ~80px/s like the ticker
    function setRowMarqueeSpeeds() {
        document.querySelectorAll('.index-row .marquee-track').forEach(track => {
            track.style.display = 'inline-flex';
            const half = track.scrollWidth / 2;
            track.style.display = '';
            if (half) track.style.setProperty('--marquee-duration', (half / 80) + 's');
        });
    }

    /* ---- Scramble headings ---- */
    function scramble(el) {
        clearInterval(el._scrambleTimer);
        // Random glyphs are wider than the real text in Anton; lock the box so the page doesn't jump
        el.style.height = el.getBoundingClientRect().height + 'px'; // exact, not rounded like offsetHeight
        el.style.overflow = 'hidden';
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
                el.style.height = '';
                el.style.overflow = '';
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
