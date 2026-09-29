// Video controls for Instagram, whose web player can't skip forward or back:
// a control bar with a scrubber, play/pause, ±5 s and speed, shown over the
// video under the mouse, plus keyboard shortcuts for that video (← / → skip
// 5 s, Space / K play or pause).
//
// It's one floating bar that follows whichever video the mouse is over,
// rather than elements inserted into Instagram's player: Instagram covers its
// videos with its own layers and re-creates video elements often, so nothing
// is added to its markup at all.
(() => {
  const SKIP = 5; // seconds
  const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75];
  const IDLE_HIDE_MS = 2500; // hide after the mouse stops moving over the video
  const MIN_SIZE = 150; // ignore small videos (avatars, previews)
  const RIGHT_GAP = 52; // leave Instagram's mute button (bottom right) uncovered

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.5v4h4"/><text x="12.3" y="15.6" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="-apple-system, Segoe UI, Roboto, sans-serif">5</text></svg>',
    forward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.5v4h-4"/><text x="11.7" y="15.6" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="-apple-system, Segoe UI, Roboto, sans-serif">5</text></svg>',
  };

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar {
      position: fixed; z-index: 2147483646; display: none; flex-direction: column; justify-content: flex-end;
      padding: 28px 12px 8px; pointer-events: none; color: #fff;
      background: linear-gradient(to top, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.25) 60%, transparent);
      font: 600 12px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      opacity: 0; transition: opacity 0.2s;
    }
    .bar.shown { display: flex; }
    .bar.visible { opacity: 1; }
    .bar > * { pointer-events: auto; }
    .row { display: flex; align-items: center; gap: 2px; }
    button {
      display: grid; place-items: center; width: 32px; height: 32px; padding: 6px; border: none; border-radius: 50%;
      background: none; color: inherit; cursor: pointer; font: inherit;
    }
    button:hover { background: rgba(255, 255, 255, 0.15); }
    button svg { width: 100%; height: 100%; display: block; }
    .time { margin-left: 6px; font-variant-numeric: tabular-nums; text-shadow: 0 0 2px rgba(0, 0, 0, 0.5); white-space: nowrap; }
    .spacer { flex: 1; }
    .speed { width: auto; min-width: 40px; height: 26px; padding: 0 8px; border-radius: 13px; background: rgba(255, 255, 255, 0.15); }
    .speed:hover { background: rgba(255, 255, 255, 0.28); }
    .speed.changed { background: #fff; color: #000; }
    /* Scrubber */
    .track { position: relative; height: 16px; margin-bottom: 2px; cursor: pointer; touch-action: none; }
    .rail, .buffered, .played {
      position: absolute; left: 0; top: 50%; height: 3px; margin-top: -1.5px; border-radius: 2px; transition: height 0.12s, margin 0.12s;
    }
    .rail { right: 0; background: rgba(255, 255, 255, 0.3); }
    .buffered { background: rgba(255, 255, 255, 0.45); }
    .played { background: #fff; }
    .track:hover .rail, .track:hover .buffered, .track:hover .played, .track.dragging .rail, .track.dragging .buffered, .track.dragging .played {
      height: 5px; margin-top: -2.5px;
    }
    .knob {
      position: absolute; top: 50%; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border-radius: 50%;
      background: #fff; box-shadow: 0 0 3px rgba(0, 0, 0, 0.4); transform: scale(0); transition: transform 0.12s;
    }
    .track:hover .knob, .track.dragging .knob { transform: scale(1); }
    .hover-time {
      position: absolute; bottom: 18px; padding: 2px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.75);
      transform: translateX(-50%); display: none; font-variant-numeric: tabular-nums;
    }
    .track:hover .hover-time, .track.dragging .hover-time { display: block; }
    .no-seek .track, .no-seek .skip { display: none; }
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
        <div class="track"><div class="rail"></div><div class="buffered"></div><div class="played"></div><div class="knob"></div><div class="hover-time"></div></div>
        <div class="row">
          <button class="play" title="Play / pause (Space or K)"></button>
          <button class="skip back" title="Back 5 seconds (←)">${ICONS.back}</button>
          <button class="skip forward" title="Forward 5 seconds (→)">${ICONS.forward}</button>
          <span class="time"></span>
          <span class="spacer"></span>
          <button class="speed" title="Playback speed">1×</button>
        </div>
      </div>`;
    bar = root.querySelector('.bar');
    els = Object.fromEntries(['track', 'buffered', 'played', 'knob', 'hover-time', 'play', 'back', 'forward', 'time', 'speed']
      .map((c) => [c, root.querySelector('.' + c)]));

    // Nothing here should reach Instagram (e.g. its click-to-pause).
    for (const type of ['click', 'mousedown', 'pointerdown', 'pointerup', 'dblclick', 'touchstart']) {
      bar.addEventListener(type, (e) => e.stopPropagation());
    }
    els.play.addEventListener('click', () => togglePlay());
    els.back.addEventListener('click', () => skip(-SKIP));
    els.forward.addEventListener('click', () => skip(SKIP));
    els.speed.addEventListener('click', () => {
      if (!video) return;
      const next = SPEEDS[(SPEEDS.indexOf(video.playbackRate) + 1) % SPEEDS.length] || 1;
      video.playbackRate = next;
      update();
    });

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
    // Only the visible part of the video counts (it may be scrolled partly off screen).
    const bottom = Math.min(r.bottom, innerHeight);
    const height = Math.min(110, bottom - Math.max(r.top, 0));
    Object.assign(bar.style, {
      left: `${r.left}px`, width: `${r.width}px`, top: `${bottom - height}px`, height: `${height}px`,
      paddingRight: `${RIGHT_GAP}px`,
    });
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
    els.speed.textContent = `${video.playbackRate}×`;
    els.speed.classList.toggle('changed', video.playbackRate !== 1);
    if (!seekable) {
      els.time.textContent = fmt(video.currentTime);
      return;
    }
    const f = video.currentTime / d;
    els.played.style.width = `${f * 100}%`;
    els.knob.style.left = `${f * 100}%`;
    let buffered = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime) buffered = Math.max(buffered, video.buffered.end(i));
    }
    els.buffered.style.width = `${(buffered / d) * 100}%`;
    els.time.textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
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
