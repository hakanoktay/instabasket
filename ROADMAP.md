# Roadmap

Features planned for upcoming versions of InstaBasket.

## Planned

### Video controls

Instagram's web player has no way to skip forward or back in a video. Add controls to videos in the feed, on post pages and in the Reels viewer:

- **Seek bar:** a thin progress bar at the bottom of the video, shown on hover. Click or drag to jump; shows elapsed and total time.
- **Keyboard shortcuts:** ← / → to skip 5 seconds back / forward; optionally Space to play / pause.
- **Playback speed:** e.g. 0.5×, 1×, 1.5×, 2×.

Notes:

- Instagram's videos are regular HTML5 `<video>` elements, so this works by setting `currentTime` / `playbackRate`. Jumping to a part that isn't loaded yet may take a moment to buffer.
- Must not interfere with Instagram's own click-to-pause behaviour, and must survive Instagram swapping `<video>` elements (see the Reels button fix in `buttons.js`).
- Styled with the same Instagram design tokens as the rest of the extension.
- Market context: many standalone Chrome extensions already do only this, so on its own it isn't a differentiator. It's planned as an extra that completes InstaBasket, not as the headline feature.
