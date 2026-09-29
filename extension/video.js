// Video controls for Instagram, whose web player can't skip forward or back:
// over the video under the mouse, a thin scrubber along the bottom edge and a
// play / pause button next to Instagram's own mute button, plus keyboard
// shortcuts for that video (← / → skip 5 s, Space / K play or pause).
//
// Not shown in Stories, which have their own progress bar and timing.
//
// It's one floating overlay that follows whichever video the mouse is over,
// rather than elements inserted into Instagram's player: Instagram covers its
// videos with its own layers and re-creates video elements often, so nothing
// is added to its markup at all.
(() => {
  const SKIP = 5; // seconds
  const IDLE_HIDE_MS = 2500; // hide after the mouse stops moving over the video
  const MIN_SIZE = 150; // ignore small videos (avatars, previews)

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
  };

  // Instagram lays its own text and buttons (username, Follow, caption, "more",
  // mute) over the bottom of videos, especially in small windows. So only two
  // things of ours sit on the video: a thin scrubber on the very bottom edge
  // and a play / pause button styled like Instagram's mute button, just left of
  // it. Everything else lets clicks through to Instagram.
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar {
      position: fixed; z-index: 2147483646; display: none; pointer-events: none; color: #fff;
      font: 600 12px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      opacity: 0; transition: opacity 0.2s;
    }
    .bar.shown { display: block; }
    .bar.visible { opacity: 1; }
    /* Play / pause: same look as Instagram's mute button, placed just left of it. */
    .play {
      position: absolute; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: none;
      border-radius: 50%; background: rgba(38, 38, 38, 0.8); color: #fff; cursor: pointer; pointer-events: auto;
      transition: background 0.12s, transform 0.12s;
    }
    .play:hover { background: rgba(38, 38, 38, 0.95); }
    .play:active { transform: scale(0.92); }
    .play svg { width: 43%; height: 43%; display: block; }
    /* Scrubber: a thin line on the very bottom edge, thicker on hover. */
    .track { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; cursor: pointer; touch-action: none; pointer-events: auto; }
    .rail, .buffered, .played {
      position: absolute; left: 0; bottom: 0; height: 3px; transition: height 0.12s;
    }
    .rail { right: 0; background: rgba(255, 255, 255, 0.28); }
    .buffered { background: rgba(255, 255, 255, 0.42); }
    /* Played part in the brand's purple (readable on any video). */
    .played { background: linear-gradient(90deg, #8119b5, #aa56d5); }
    .track:hover .rail, .track:hover .buffered, .track:hover .played, .track.dragging .rail, .track.dragging .buffered, .track.dragging .played {
      height: 6px;
    }
    .knob {
      position: absolute; bottom: -3.5px; width: 13px; height: 13px; margin-left: -6.5px; border-radius: 50%;
      background: #fff; box-shadow: 0 0 0 3px rgba(170, 86, 213, 0.45), 0 1px 3px rgba(0, 0, 0, 0.4);
      transform: scale(0); transition: transform 0.12s;
    }
    .track:hover .knob, .track.dragging .knob { transform: scale(1); }
    .hover-time {
      position: absolute; bottom: 14px; padding: 2px 6px; border-radius: 4px; background: rgba(20, 8, 28, 0.8);
      transform: translateX(-50%); display: none; font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .track:hover .hover-time, .track.dragging .hover-time { display: block; }
    .no-seek .track { display: none; }
  `;


  let host, bar, els;
  let video = null; // the video the bar is on
  let hideTimer, raf, dragging = false, lastMouse = null;

  function build() {
    host = document.createElement('div');
    host.id = 'keepkeep-video';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="bar">
        <button class="play" title="Play / pause (Space or K)"></button>
        <div class="track"><div class="rail"></div><div class="buffered"></div><div class="played"></div><div class="knob"></div><div class="hover-time"></div></div>
      </div>`;
    bar = root.querySelector('.bar');
    els = Object.fromEntries(['track', 'buffered', 'played', 'knob', 'hover-time', 'play']
      .map((c) => [c, root.querySelector('.' + c)]));

    // Nothing here should reach Instagram (e.g. its click-to-pause).
    for (const type of ['click', 'mousedown', 'pointerdown', 'pointerup', 'dblclick', 'touchstart']) {
      bar.addEventListener(type, (e) => e.stopPropagation());
    }
    els.play.addEventListener('click', () => togglePlay());

    // Scrubbing: click or drag anywhere on the track.
    const seekTo = (e) => {
      if (!video || !isFinite(video.duration)) return;
      const r = els.track.getBoundingClientRect();
      video.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * video.duration;
      update();
    };
    els.track.addEventListener('pointerdown', (e) => {
      dragging = true;
      els.track.classList.add('dragging');
      els.track.setPointerCapture(e.pointerId);
      seekTo(e);
    });
    els.track.addEventListener('pointermove', (e) => {
      showHoverTime(e);
      if (dragging) seekTo(e);
    });
    const endDrag = () => {
      dragging = false;
      els.track.classList.remove('dragging');
    };
    els.track.addEventListener('pointerup', endDrag);
    els.track.addEventListener('pointercancel', endDrag);

    document.documentElement.appendChild(host);
  }

  function showHoverTime(e) {
    if (!video || !isFinite(video.duration)) return;
    const r = els.track.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    els['hover-time'].style.left = `${f * 100}%`;
    els['hover-time'].textContent = fmt(f * video.duration);
  }

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  function togglePlay(v = video) {
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    update();
  }

  function skip(seconds, v = video) {
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(v.currentTime + seconds, 0), v.duration - 0.1);
    update();
  }

  // ---- Which video, and keeping the bar on it ----

  function candidates() {
    // Stories have their own progress bar and timing; skipping would break them.
    if (location.pathname.startsWith('/stories/')) return [];
    return [...document.querySelectorAll('video')].filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width >= MIN_SIZE && r.height >= MIN_SIZE && r.bottom > 0 && r.top < innerHeight;
    });
  }

  function videoAt(x, y) {
    return candidates().find((v) => {
      const r = v.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }) || null;
  }

  function place() {
    if (!video || !video.isConnected) return hide(true);
    const r = video.getBoundingClientRect();
    if (r.width < MIN_SIZE || r.bottom <= 0 || r.top >= innerHeight) return hide(true);
    // Cover the visible part of the video (it may be scrolled partly off screen).
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, innerHeight);
    Object.assign(bar.style, { left: `${r.left}px`, width: `${r.width}px`, top: `${top}px`, height: `${bottom - top}px` });

    // Play / pause: same size as Instagram's mute button and just left of it,
    // vertically centred on it. Without a mute button, where it would be.
    const mute = muteButton(r);
    const size = mute ? Math.round(Math.min(Math.max(mute.height, 24), 40)) : 28;
    const gap = 8;
    const muteLeft = mute ? mute.left : r.right - 12 - 28;
    const muteMid = mute ? mute.top + mute.height / 2 : r.bottom - 12 - 14;
    Object.assign(els.play.style, {
      width: `${size}px`, height: `${size}px`,
      left: `${muteLeft - gap - size - r.left}px`, top: `${muteMid - size / 2 - top}px`,
    });
  }

  // Instagram's mute button: the small round icon button in the video's
  // bottom-right corner. Looked up by position (it has no stable markers);
  // re-checked at most a few times a second.
  let muteCache = { at: 0, video: null, rect: null };
  function muteButton(r) {
    if (muteCache.video === video && performance.now() - muteCache.at < 400) return muteCache.rect;
    let rect = null;
    for (const el of document.elementsFromPoint(r.right - 26, r.bottom - 26)) {
      if (el === video || el.id === 'keepkeep-video') continue;
      const target = el.closest('[role="button"], button') || (el.querySelector?.('svg') ? el : null);
      if (!target) continue;
      const b = target.getBoundingClientRect();
      if (b.width >= 16 && b.width <= 60 && b.height >= 16 && b.height <= 60 && b.right <= r.right + 1 && b.bottom <= r.bottom + 1) {
        rect = b;
        break;
      }
    }
    muteCache = { at: performance.now(), video, rect };
    return rect;
  }

  function show(v) {
    if (!host) build();
    if (video !== v) {
      video = v;
      delete els.play.dataset.state;
      update();
    }
    bar.classList.add('shown');
    place();
    requestAnimationFrame(() => bar.classList.add('visible'));
    loop();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!dragging && !bar.matches(':hover')) hide(); else show(video); }, IDLE_HIDE_MS);
  }

  function hide(now) {
    if (!bar) return;
    clearTimeout(hideTimer);
    bar.classList.remove('visible');
    const done = () => {
      if (bar.classList.contains('visible')) return;
      bar.classList.remove('shown');
      cancelAnimationFrame(raf);
      raf = null;
    };
    if (now) done();
    else setTimeout(done, 200);
  }

  // While shown, keep the bar in place and the time up to date.
  function loop() {
    if (raf) return;
    const tick = () => {
      place();
      update();
      raf = bar.classList.contains('shown') ? requestAnimationFrame(tick) : null;
    };
    raf = requestAnimationFrame(tick);
  }

  function update() {
    if (!video || !els) return;
    const d = video.duration;
    const seekable = isFinite(d) && d > 0;
    bar.classList.toggle('no-seek', !seekable);
    const state = video.paused ? 'play' : 'pause';
    if (els.play.dataset.state !== state) {
      els.play.dataset.state = state;
      els.play.innerHTML = ICONS[state];
      els.play.title = video.paused ? 'Play (Space or K)' : 'Pause (Space or K)';
    }
    if (!seekable) return;
    const f = video.currentTime / d;
    els.played.style.width = `${f * 100}%`;
    els.knob.style.left = `${f * 100}%`;
    let buffered = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime) buffered = Math.max(buffered, video.buffered.end(i));
    }
    els.buffered.style.width = `${(buffered / d) * 100}%`;
  }

  // Mouse over a video (Instagram's layers on top of it don't matter: the
  // position is checked against the video's own box).
  let moveQueued = false;
  addEventListener('mousemove', (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      const v = videoAt(lastMouse.x, lastMouse.y);
      if (v) show(v);
      else if (video && !dragging && !(bar && bar.matches(':hover'))) hide();
    });
  }, { passive: true, capture: true });
  document.addEventListener('mouseleave', () => { if (!dragging) hide(); });

  // Keyboard: ← / → skip, Space / K play or pause.
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.composedPath()[0];
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = e.key;
    if (!['ArrowLeft', 'ArrowRight', ' ', 'k', 'K'].includes(key)) return;
    // Only for the video under the mouse: otherwise the keys keep doing what
    // Instagram uses them for (arrows move between posts, Space scrolls).
    const v = lastMouse && videoAt(lastMouse.x, lastMouse.y);
    if (!v) return;
    if (key.startsWith('Arrow') && !isFinite(v.duration)) return;
    e.preventDefault();
    e.stopPropagation();
    if (key === 'ArrowLeft') skip(-SKIP, v);
    else if (key === 'ArrowRight') skip(SKIP, v);
    else togglePlay(v);
    show(v);
  }, true);
})();
