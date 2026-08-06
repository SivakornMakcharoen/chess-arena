const YOUTUBE_MUSIC_KEY = 'chess-arena-youtube-music-url';
const YOUTUBE_MUSIC_POS_KEY = 'chess-arena-youtube-music-position';
const YOUTUBE_MUSIC_SIZE_KEY = 'chess-arena-youtube-music-size';
const YOUTUBE_MUSIC_CLOSED_KEY = 'chess-arena-youtube-music-closed';
const DEFAULT_YOUTUBE_MUSIC = '';
const UNAVAILABLE_DEFAULT_VIDEO_ID = 'jfKfPfyJRdk';
let activeYouTubeMusicUrl = DEFAULT_YOUTUBE_MUSIC;


function ensureMusicPlayerMarkup() {
    if (document.getElementById('music-panel')) return;

    const opener = document.createElement('button');
    opener.className = 'music-open-btn music-pending';
    opener.id = 'music-open-btn';
    opener.type = 'button';
    opener.setAttribute('aria-label', 'Open background music');
    opener.textContent = 'Music';
    opener.addEventListener('click', showMusicPlayer);

    const panel = document.createElement('div');
    panel.className = 'music-panel music-pending';
    panel.id = 'music-panel';
    panel.setAttribute('aria-label', 'Background music');
    panel.innerHTML = `
        <div class="music-panel-head" id="music-drag-handle">
            <div>
                <div class="music-title">Background Music</div>
                <div class="music-subtitle">Drag to move, resize from the corner</div>
            </div>
            <div class="music-actions">
                <a class="music-link" id="music-youtube-link" href="https://www.youtube.com" target="_blank" rel="noopener">YouTube</a>
                <button class="music-icon-btn" id="music-close-btn" type="button" aria-label="Close background music">x</button>
            </div>
        </div>
        <div class="music-controls">
            <input type="url" id="youtube-url-input" placeholder="Paste YouTube music link" autocomplete="off">
            <button class="btn btn-sm" id="youtube-open-btn" type="button">Open</button>
        </div>
        <div class="music-status" id="music-status" aria-live="polite"></div>
        <div class="music-player">
            <iframe
                id="youtube-music-frame"
                src=""
                title="Background music"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
            </iframe>
        </div>
    `;

    document.body.append(opener, panel);
    document.getElementById('music-close-btn')?.addEventListener('click', hideMusicPlayer);
    document.getElementById('youtube-open-btn')?.addEventListener('click', loadYouTubeMusic);
}
function getYouTubeVideoId(rawUrl) {
    const value = (rawUrl || '').trim();
    if (!value) return null;

    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
        if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
            if (url.searchParams.get('v')) return url.searchParams.get('v');

            const parts = url.pathname.split('/').filter(Boolean);
            if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
                return parts[1] || null;
            }
        }
    } catch {
        if (/^[\w-]{11}$/.test(value)) return value;
    }

    return /^[\w-]{11}$/.test(value) ? value : null;
}

function getStoredValue(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function setStoredValue(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}


function getSavedMusicUrl() {
    const savedUrl = getStoredValue(YOUTUBE_MUSIC_KEY) || '';
    if (getYouTubeVideoId(savedUrl) === UNAVAILABLE_DEFAULT_VIDEO_ID) {
        try { localStorage.removeItem(YOUTUBE_MUSIC_KEY); } catch { /* storage unavailable */ }
        return '';
    }
    return savedUrl;
}
function clampMusicPanel() {
    const panel = document.getElementById('music-panel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    const top = Math.min(Math.max(8, rect.top), maxTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function saveMusicPanelPosition() {
    const panel = document.getElementById('music-panel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    const rect = panel.getBoundingClientRect();
    setStoredValue(YOUTUBE_MUSIC_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
}

function saveMusicPanelSize() {
    const panel = document.getElementById('music-panel');
    if (!panel || panel.classList.contains('is-hidden')) return;

    const rect = panel.getBoundingClientRect();
    setStoredValue(YOUTUBE_MUSIC_SIZE_KEY, JSON.stringify({ width: rect.width, height: rect.height }));
}

function restoreMusicPanelLayout() {
    const panel = document.getElementById('music-panel');
    if (!panel) return;

    const savedSize = getStoredValue(YOUTUBE_MUSIC_SIZE_KEY);
    if (savedSize) {
        try {
            const { width, height } = JSON.parse(savedSize);
            if (Number.isFinite(width)) panel.style.width = `${Math.min(width, window.innerWidth - 16)}px`;
            if (Number.isFinite(height)) panel.style.height = `${Math.min(height, window.innerHeight - 16)}px`;
        } catch { /* ignore bad saved size */ }
    }

    const savedPosition = getStoredValue(YOUTUBE_MUSIC_POS_KEY);
    if (savedPosition) {
        try {
            const { left, top } = JSON.parse(savedPosition);
            if (Number.isFinite(left) && Number.isFinite(top)) {
                panel.style.left = `${left}px`;
                panel.style.top = `${top}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        } catch { /* ignore bad saved position */ }
    }

    requestAnimationFrame(clampMusicPanel);
}

function setYouTubeMusic(rawUrl, shouldSave = true) {
    const videoId = getYouTubeVideoId(rawUrl);
    const input = document.getElementById('youtube-url-input');
    const frame = document.getElementById('youtube-music-frame');
    const link = document.getElementById('music-youtube-link');
    const status = document.getElementById('music-status');

    if (!videoId || !frame || !link) {
        if (status) status.textContent = rawUrl ? 'Invalid YouTube link' : 'Paste a YouTube link first';
        if (input) input.focus();
        return false;
    }

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    activeYouTubeMusicUrl = watchUrl;
    frame.src = `https://www.youtube.com/embed/${videoId}?rel=0`;
    link.href = watchUrl;
    if (input) input.value = watchUrl;
    if (status) status.textContent = '';

    if (shouldSave) setStoredValue(YOUTUBE_MUSIC_KEY, watchUrl);
    return true;
}


function stopEmbeddedMusic() {
    const frame = document.getElementById('youtube-music-frame');
    if (frame) frame.src = '';
}
function loadYouTubeMusic() {
    const input = document.getElementById('youtube-url-input');
    const requestedUrl = input?.value?.trim() || DEFAULT_YOUTUBE_MUSIC;
    const panel = document.getElementById('music-panel');
    const opener = document.getElementById('music-open-btn');

    panel?.classList.remove('music-pending', 'is-hidden');
    opener?.classList.remove('music-pending', 'is-visible');
    setStoredValue(YOUTUBE_MUSIC_CLOSED_KEY, '0');
    setYouTubeMusic(requestedUrl);
    requestAnimationFrame(clampMusicPanel);
}

function hideMusicPlayer() {
    const panel = document.getElementById('music-panel');
    const opener = document.getElementById('music-open-btn');

    saveMusicPanelPosition();
    saveMusicPanelSize();
    panel?.classList.remove('music-pending');
    opener?.classList.remove('music-pending');
    panel?.classList.add('is-hidden');
    opener?.classList.add('is-visible');
    stopEmbeddedMusic();
    setStoredValue(YOUTUBE_MUSIC_CLOSED_KEY, '1');
}

function showMusicPlayer() {
    const panel = document.getElementById('music-panel');
    const opener = document.getElementById('music-open-btn');

    panel?.classList.remove('music-pending', 'is-hidden');
    opener?.classList.remove('music-pending', 'is-visible');
    setStoredValue(YOUTUBE_MUSIC_CLOSED_KEY, '0');
    const musicUrl = activeYouTubeMusicUrl || getSavedMusicUrl() || DEFAULT_YOUTUBE_MUSIC;
    if (musicUrl) {
        setYouTubeMusic(musicUrl, false);
    } else {
        const status = document.getElementById('music-status');
        if (status) status.textContent = 'Paste a YouTube link and press Open';
    }
    requestAnimationFrame(clampMusicPanel);
}

function initMusicDrag() {
    const panel = document.getElementById('music-panel');
    const handle = document.getElementById('music-drag-handle');
    if (!panel || !handle) return;

    let drag = null;

    handle.addEventListener('pointerdown', event => {
        if (event.target.closest('button, a, input')) return;

        const rect = panel.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;

        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        const left = Math.min(Math.max(8, event.clientX - drag.offsetX), maxLeft);
        const top = Math.min(Math.max(8, event.clientY - drag.offsetY), maxTop);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    });

    const endDrag = event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag = null;
        saveMusicPanelPosition();
    };

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
}

function initYouTubeMusic() {
    ensureMusicPlayerMarkup();
    const panel = document.getElementById('music-panel');
    const input = document.getElementById('youtube-url-input');
    if (!panel || !input) return;

    activeYouTubeMusicUrl = getSavedMusicUrl() || DEFAULT_YOUTUBE_MUSIC;
    if (activeYouTubeMusicUrl) {
        setYouTubeMusic(activeYouTubeMusicUrl, false);
    } else {
        const status = document.getElementById('music-status');
        if (status) status.textContent = 'Paste a YouTube link and press Open';
    }
    restoreMusicPanelLayout();
    initMusicDrag();

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') loadYouTubeMusic();
    });

    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(() => {
            saveMusicPanelSize();
            clampMusicPanel();
        });
        observer.observe(panel);
    }

    window.addEventListener('resize', () => {
        clampMusicPanel();
        saveMusicPanelPosition();
    });

    if (getStoredValue(YOUTUBE_MUSIC_CLOSED_KEY) === '1') {
        hideMusicPlayer();
    } else {
        showMusicPlayer();
    }
}

window.addEventListener('pagehide', stopEmbeddedMusic);

Object.assign(window, { hideMusicPlayer, loadYouTubeMusic, showMusicPlayer });

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initYouTubeMusic, { once: true });
} else {
    initYouTubeMusic();
}
