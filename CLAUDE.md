# KeepKeep — notes for Claude

KeepKeep (formerly InstaBasket) is a Chrome Manifest V3 extension for
instagram.com: save profiles and posts into your own lists, download photos
and videos in full quality, watch stories anonymously, and control videos.
There is no build step; `extension/` is loaded unpacked as is.

## Working with the owner

- The owner writes in Turkish; answer in Turkish. Everything in the repository
  (code, UI text, docs, store texts) is in English.
- Explain things plainly, like a person, not a machine. Be brief.
- Don't guess about Instagram's behaviour; check it (console snippets for the
  owner to run, or tests) before claiming something.
- Never put "Instagram" in the extension's name or icon (trademark).
- Never put the owner's email address in public files; the contact is GitHub
  Issues.
- Downloads: separate files straight into `Downloads/KeepKeep`. The owner
  explicitly rejected ZIPs, folder pickers, extra windows and advice to
  change Chrome settings. (Chrome's "Ask where to save each file" is off by
  default and cannot be bypassed by extensions; the owner has it off.)

## Layout

| Path | What |
| --- | --- |
| `extension/manifest.json` | MV3 manifest, version, content script order |
| `extension/stories-main.js` | MAIN world, `document_start`: wraps fetch/XHR and answers the "story seen" request locally when anonymous mode is on |
| `extension/veil.js`, `veil.css` | Anonymous-mode theme ("the veil"): purple tint via Instagram's CSS variables, story rings (89px canvases tinted with a filter), mask badges, capsule, reply/reaction warnings, the "will be able to see" gate answer |
| `extension/basket.js` | Storage of saved profiles / media / lists |
| `extension/instagram.js` | Instagram data: `mediaFiles(code, {originals})`, `embedOriginals`, `story(pk)`, `storyReel(pk)`, `filesOf`, `fileKey` |
| `extension/panel.js` | In-page "add to list" card |
| `extension/content.js` | `download(code)`, `downloadStory(pk)`, `pageInfo` |
| `extension/buttons.js` | Profile / Media / Download buttons on posts, reels, profiles; the story hover pill; D key |
| `extension/video.js` | Scrubber and play/pause for every video |
| `extension/background.js` | Service worker: downloads, anonymous toolbar icon (`icons/anon*.png`) |
| `extension/offscreen.js` | Fetches files (rejects non image/video responses, fallback URL), progress, one blob per file |
| `extension/popup.*` | Popup: lists, single-pane settings slide (opens only via ⚙) |
| `ROADMAP.md` | Planned / under consideration / done |
| `store/` | Chrome Web Store listing, privacy answers, images (`assets/`) |
| `docs/` | GitHub Pages site: `index.html`, `privacy.html`, `images/` |
| `scripts/package.sh` | Validates the manifest, writes `dist/keepkeep-<version>.zip` |

## Instagram knowledge (verified)

- **Original photos:** the post's `/p/<code>/embed/captioned/` page has image
  URLs whose `stp` has no size (e.g. `dst-jpg_e35_tt6`), up to 3072 px. URLs
  are signed: editing or removing `stp` gives 403. "Standard" = the API's
  largest candidate (~1080 px).
- **Stories:** `/api/v1/media/<pk>/info/` for one story, then
  `reels_media?reel_ids=<user.pk>` for all current stories of the account.
  Avoid `web_profile_info` (429 rate limits). The story id can be read from
  `ig_cache_key` (base64) in the story image URL when the URL has no id.
- **Theme:** CSS variables (`--accent`, `--blue-5`, `--ig-primary-button`, …)
  and `__fb-light-mode` / `__fb-dark-mode` classes.
- **Videos:** a single progressive file only up to ~720p; 1080p is DASH
  (separate video + audio).

## Hard-won fixes (don't regress)

- Button scanning is **throttled, not debounced** (a debounce starved while
  Instagram kept mutating the DOM), plus a 1 s `setInterval` safety net;
  hidden posts are skipped and a WeakMap re-adds action groups Instagram
  re-renders. This fixed buttons missing after closing the story viewer.
- The video overlay is mounted **inside the player** (the largest positioned
  ancestor about the video's size) so it scrolls with the post without lag;
  the mute-button position is stored relative to the video.
- Story pill: hover-only, dark backing, z-index 2147483647, keeps the card
  rect for 1.5 s to avoid flicker; the current story falls back to the image
  id.
- Popup settings: the inactive pane is `display:none` (otherwise the popup
  auto-sizes to two columns).

## Testing

Playwright with the pre-installed Chromium, loading `extension/` unpacked
against local Instagram-like demo pages. The CDN is faked with a local HTTPS
server and `--host-resolver-rules`; serve page image requests with
`context.route` (they hang otherwise). Store images were captured from the
real extension UI on demo pages (Inter font) and composed with a script. The
earlier test scripts lived in a session scratchpad and are not in the repo.

## Status / next

- 1.0.0 is published on the Chrome Web Store as **Unlisted** (item id
  `jelnnpodemcgdhehjokojjbahgjjgmeb`,
  https://chromewebstore.google.com/detail/jelnnpodemcgdhehjokojjbahgjjgmeb),
  publisher account "non-trader". The repository is `hakanoktay/keepkeep`,
  default branch `main`, GitHub Pages from `main` / `docs`.
- **Top priority for the next version:** "Never asks for your password" in
  the store screenshots, description, a first-run welcome tab and the popup
  (see `ROADMAP.md`). A new store screenshot set is needed for it.
- Also next version: drag-and-drop reordering of lists in the "Add to a list"
  card and no order numbers in the list boxes (see `ROADMAP.md`).
- Not started (waiting for the owner): kept story copies, video Original via
  DASH merge, highlights, one Quality setting — see `ROADMAP.md`.
