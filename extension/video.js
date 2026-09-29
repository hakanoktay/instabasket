// Video controls for Instagram, whose web player can't skip forward or back:
// on every video on screen, a thin scrubber along the bottom edge and a play /
// pause button next to Instagram's own mute button, always visible; plus
// keyboard shortcuts for the video under the mouse (← / → skip 5 s, Space / K
// play or pause).
//
// Not shown in Stories, which have their own progress bar and timing.
//
// Each video gets a floating overlay that follows it, rather than elements
// inserted into Instagram's player: Instagram covers its
// videos with its own layers and re-creates video elements often, so nothing
// is added to its markup at all.
(() => {
  const SKIP = 5; // seconds
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


  // One overlay (scrubber + play/pause) per video on screen, always visible.
  const overlays = new Map(); // <video> → overlay
  let lastMouse = null;

  function createOverlay(video) {
    const host = document.createElement('div');
    host.className = 'keepkeep-video';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="bar shown visible">
        <button class="play" title="Play / pause (Space or K)"></button>
        <div class="track"><div class="rail"></div><div class="buffered"></div><div class="played"></div><div class="knob"></div><div class="hover-time"></div></div>
      </div>`;
    const bar = root.querySelector('.bar');
    const els = Object.fromEntries(['track', 'buffered', 'played', 'knob', 'hover-time', 'play']
      .map((c) => [c, root.querySelector('.' + c)]));
    const o = { video, host, bar, els, dragging: false, mute: { at: 0, rect: null } };

    // Nothing here should reach Instagram (e.g. its click-to-pause).
    for (const type of ['click', 'mousedown', 'pointerdown', 'pointerup', 'dblclick', 'touchstart']) {
      bar.addEventListener(type, (e) => e.stopPropagation());
    }
    els.play.addEventListener('click', () => togglePlay(video));

    // Scrubbing: click or drag anywhere on the track.
    const fraction = (e) => {
      const r = els.track.getBoundingClientRect();
      return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    };
    const seekTo = (e) => {
      if (!isFinite(video.duration)) return;
      video.currentTime = fraction(e) * video.duration;
      update(o);
    };
    els.track.addEventListener('pointerdown', (e) => {
      o.dragging = true;
      els.track.classList.add('dragging');
      els.track.setPointerCapture(e.pointerId);
      seekTo(e);
    });
    els.track.addEventListener('pointermove', (e) => {
      if (isFinite(video.duration)) {
        els['hover-time'].style.left = `${fraction(e) * 100}%`;
        els['hover-time'].textContent = fmt(fraction(e) * video.duration);
      }
      if (o.dragging) seekTo(e);
    });
    const endDrag = () => {
      o.dragging = false;
      els.track.classList.remove('dragging');
    };
    els.track.addEventListener('pointerup', endDrag);
    els.track.addEventListener('pointercancel', endDrag);

    document.documentElement.appendChild(host);
    return o;
  }

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  function togglePlay(v) {
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    const o = overlays.get(v);
    if (o) update(o);
  }

  function skip(seconds, v) {
    if (!isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(v.currentTime + seconds, 0), v.duration - 0.1);
    const o = overlays.get(v);
    if (o) update(o);
  }

  // ---- Which videos, and keeping each overlay on its video ----

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

  // Whether another layer covers the video: the element on top at the video's
  // centre should be the video or part of its own player (Instagram's overlay
  // layers), not something from elsewhere on the page.
  function isCovered(video) {
    const r = video.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    const top = document.elementsFromPoint(x, y).find((el) => !el.classList?.contains('keepkeep-video') && !el.closest?.('.keepkeep-video'));
    if (!top || top === video || video.contains(top)) return false;
    // The player: the largest ancestor that is still about the video's size.
    let player = video;
    for (let el = video.parentElement; el && el !== document.body; el = el.parentElement) {
      const b = el.getBoundingClientRect();
      if (Math.abs(b.width - r.width) > 40 || Math.abs(b.height - r.height) > 120) break;
      player = el;
    }
    return !player.contains(top);
  }

  function place(o) {
    const r = o.video.getBoundingClientRect();
    // Cover the visible part of the video (it may be scrolled partly off screen).
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, innerHeight);
    Object.assign(o.bar.style, { left: `${r.left}px`, width: `${r.width}px`, top: `${top}px`, height: `${bottom - top}px` });

    // Play / pause: same size as Instagram's mute button and just left of it,
    // vertically centred on it. Without a mute button, where it would be.
    const mute = muteButton(o, r);
    const size = mute ? Math.round(Math.min(Math.max(mute.height, 24), 40)) : 28;
    const gap = 8;
    const muteLeft = mute ? mute.left : r.right - 12 - 28;
    const muteMid = mute ? mute.top + mute.height / 2 : r.bottom - 12 - 14;
    // Hidden while the bottom of the video is scrolled off screen.
    o.els.play.style.display = r.bottom > innerHeight ? 'none' : '';
    Object.assign(o.els.play.style, {
      width: `${size}px`, height: `${size}px`,
      left: `${muteLeft - gap - size - r.left}px`, top: `${muteMid - size / 2 - top}px`,
    });
  }

  // Instagram's mute button: the small round icon button in the video's
  // bottom-right corner. Looked up by position (it has no stable markers);
  // re-checked at most a few times a second.
  function muteButton(o, r) {
    if (performance.now() - o.mute.at < 400) return o.mute.rect;
    let rect = null;
    if (r.bottom <= innerHeight) {
      for (const el of document.elementsFromPoint(r.right - 26, r.bottom - 26)) {
        if (el === o.video || el.classList?.contains('keepkeep-video')) continue;
        const target = el.closest('[role="button"], button') || (el.querySelector?.('svg') ? el : null);
        if (!target) continue;
        const b = target.getBoundingClientRect();
        if (b.width >= 16 && b.width <= 60 && b.height >= 16 && b.height <= 60 && b.right <= r.right + 1 && b.bottom <= r.bottom + 1) {
          rect = b;
          break;
        }
      }
    }
    o.mute = { at: performance.now(), rect };
    return rect;
  }

  function update(o) {
    const { video, bar, els } = o;
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

  // Every frame: keep each overlay on its video and up to date; a few times a
  // second, pick up videos that appeared and drop ones that are gone.
  let lastScan = 0;
  function tick(now) {
    if (now - lastScan > 250) {
      lastScan = now;
      const visible = new Set(candidates());
      for (const v of visible) if (!overlays.has(v)) overlays.set(v, createOverlay(v));
      for (const [v, o] of overlays) {
        if (!visible.has(v) && !o.dragging) {
          o.host.remove();
          overlays.delete(v);
          continue;
        }
        // Hidden while something else is on top of the video, e.g. Instagram's
        // post popup over a video in the feed behind it.
        o.host.style.display = isCovered(v) && !o.dragging ? 'none' : '';
      }
    }
    for (const o of overlays.values()) {
      place(o);
      update(o);
    }
    requestAnimationFrame(tick);
  }
  // Remove overlays left by a previous copy of the extension (after an update).
  document.querySelectorAll('.keepkeep-video, #keepkeep-video').forEach((el) => el.remove());
  requestAnimationFrame(tick);

  addEventListener('mousemove', (e) => { lastMouse = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });

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
  }, true);
})();
