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
- "Instagram" may appear in the extension's name only as a descriptor at the
  end ("KeepKeep – … for Instagram"); never "Insta" / "Gram", never the
  Instagram logo or look in the icon or images (trademark).
- Never put the owner's email address in public files; the contact is GitHub
  Issues.
- Downloads: separate files straight into `Downloads/KeepKeep`. The owner
  explicitly rejected ZIPs, folder pickers, extra windows and advice to
  change Chrome settings. (Chrome's "Ask where to save each file" is off by
  default and cannot be bypassed by extensions; the owner has it off.)

- Anonymous stories are **on by default for new installs** (set in `background.js` on install only); existing users keep their setting.
- **Never lose users' data on update.** Since 1.0.0 is in users' hands,
  `chrome.storage.local` survives every store update, but only if the code
  still understands it: any change to the stored format must read the old
  format and migrate it (in `basket.js`), never reset or drop keys. Test an
  update from the 1.0.0 data before releasing.

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
| `extension/app.html`, `app.css` | KeepKeep's own full tab (opened by the popup's "Open KeepKeep" button). Shell with sidebar (Profiles and Media, the lists section under them, Settings and About at the bottom); the CSS is the same family as the store images (Inter in `fonts/`, lilac) |
| `extension/app/core.js` | App shell and router: `KeepKeepApp.view(name, fn)` registers a view, `go(hash)` navigates, `state`, `on` / `emit` (events), `el` (DOM helper), `icon` |
| `extension/app/saved.js` | Profiles / Media grids: search, filters, live updates from storage, chunked rendering, selection, bulk actions (remove, add to list, download), undo. `KeepKeepApp.saved` = `{selected, filters, rerender(reset)}`: `rerender()` when data changed, `rerender(true)` when filters changed |
| `extension/app/lists.js` | Lists in the sidebar: create, rename, delete, reorder; `KeepKeepApp.lists.dropTarget` makes an element accept dragged items |
| `extension/app/download.js` | Registers no view: sets `KeepKeepApp.saved.bulkDownload` (the bulk bar's Download button for selected media), which sends the `download-keys` message to an open Instagram tab; with none open it shows a notice with an "Open Instagram" link |
| `extension/app/settings.js` | Settings, Backup (export / import) and About views; import was folded in here (old `import.html` is gone). The backup format and merge rules are in `basket.js` (`exportData`, `importData`): import only adds, never deletes; bump `BACKUP_VERSION` and keep reading old versions if the format changes |
| `extension/app/welcome.js` | First-run welcome view `app.html#welcome` (opened by `background.js` only on install), styled like the store images: the app headline first, steps, then the trust badges as the supporting line. The privacy message is never the headline |
| `extension/app/whats-new.js` | `WHATS_NEW` notes per version, `shouldShowWhatsNew(previous, current)`, `pagesToOpen(details, version)`; also loaded by `background.js` via `importScripts` (no DOM in the decision code), the view is registered only in the app page. Add notes for each minor release |
| `extension/popup.*` | Popup: lists, single-pane settings slide (opens only via ⚙) |
| `ROADMAP.md` | Planned / under consideration / done |
| `specs/` | Design and plan of the app page (`2026-10-02-keepkeep-app-page.md`, `...-plan.md`) |
| `store/` | Chrome Web Store listing, privacy answers, images (`assets/`) |
| `docs/` | GitHub Pages site: `index.html`, `privacy.html`, `images/` |
| `scripts/package.sh` | Validates the manifest, writes `dist/keepkeep-<version>.zip` |
| `scripts/store-badges.mjs` | Adds the trust badges to the store images: `store/source/*.png` (badge-free originals, the owner loves these – don't redesign) → `store/assets/` |

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

`cd tests && npm test` (Playwright, full Chromium via `channel: 'chromium'`;
the headless shell can't load extensions). `tests/fixtures.js` loads
`extension/` unpacked and answers `https://www.instagram.com/?page=<name>`
with `tests/pages/<name>.html`; CDN requests get 404 unless a test routes
them. Add a test for every fix, so it stays fixed. First-time setup:
`cd tests && npm install && npx playwright install chromium`.

Real Instagram: `./scripts/dev-chrome.sh` opens a separate Chrome profile
(`~/.keepkeep-dev-chrome`, the owner signed in there) with only the unpacked
extension and port 9222, so scripts can look at real pages with
`chromium.connectOverCDP('http://127.0.0.1:9222')`. Read only: never like,
follow, comment or post from it. Chrome refuses this port on the everyday
profile, where the store version is also installed (buttons would show twice,
and the unpacked copy has its own, empty storage).

Earlier (1.0.0) notes: Playwright loading `extension/` unpacked
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
- **Release timing (owner):** 1.1.0 is released only after the app page (full tab) is built and everything works; no version bump / ZIP before that.
- **Next version (1.1.0) is being built in the `v1.1.0` branch.** Done there,
  each with tests: the list card blink (also after the card closed by
  itself; closing now folds the list picker first), the "basket" wording,
  drag-to-reorder lists with no order numbers, the popup's aria-hidden
  warning, the password / privacy message (popup, welcome, About), "Made by
  Zetasis" and About, Export & import, the store name. What is left is the
  release itself (see the next bullet).
- **The app page is built in v1.1.0** (`app.html` + `app/*.js`, design and plan
  in `specs/`): Profiles / Media grids with search, filters, selection, bulk
  actions and drag to lists; lists sidebar; download via an Instagram tab;
  Settings / Backup / About; Welcome on install; What's new after updates. The
  release still waits for the owner's go: version bump, update test from the
  1.0.0 data, regenerate the "Private by design" screenshot with v1.1.0, the
  owner chooses which of the 6 screenshots to leave out, then the ZIP.
- **The privacy message (done in v1.1.0, keep it exact):** "Never asks for your
  password. Your data never leaves your computer." in the summary (manifest
  `description`), the welcome view and the popup / About (wording and placement
  in `ROADMAP.md`). The store description in `store/listing.md` opens with it,
  and every store image has the "No password · No tracking · No ads" badges
  (`scripts/store-badges.mjs`). Left for the release: the dedicated 2nd "Private
  by design" screenshot must be regenerated with v1.1.0. Never claim "collects
  no data" (the store panel lists Website content).
- Done in v1.1.0 (see the bullet above): list reordering, no order numbers,
  Export & import, no user-visible "basket" wording, the quiet "Made by
  Zetasis · ☕ Buy me a coffee" line (coffee link:
  https://buymeacoffee.com/zetasis; Zetasis website: https://zetasis.net), and
  the "Add to a list" card blink (cause and fix in `ROADMAP.md`). The owner
  wants even small visual glitches fixed: quality first.
- Store name decided and applied (v1.1.0): "KeepKeep – Downloader & Anonymous Story Viewer for Instagram"
  in `manifest.json` (the store takes it from there), `short_name`
  "KeepKeep"; inside the extension it is just "KeepKeep".
- After the next version, the owner's feature order: 1) the app page's next steps (it exists
  since v1.1.0), 2) caption search, 3) moodboard export, 4) influencer
  shortlist, 5) learning mode for Reels (see `ROADMAP.md`). Keep KeepKeep
  simple and elegant; no posting / scheduling.
- Positioning vs. Inssist ("INSSIST: Web Client for Instagram", ~600k users,
  free core + PRO): don't compete on feature count; KeepKeep's edge is
  simplicity and quality (lists, original-size downloads, the veil). Its
  single purpose is defined narrowly ("save, organise, download while
  browsing"); adding something outside it (e.g. scheduling) would mean
  rewriting the store purpose first. Free core + PRO (Insights, influencer
  shortlist) is the likely money model; selling PRO means switching the
  publisher account to "trader".
- Not started (waiting for the owner): kept story copies, video Original via
  DASH merge, highlights, one Quality setting — see `ROADMAP.md`.
