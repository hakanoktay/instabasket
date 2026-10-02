# KeepKeep app page — design

Status: proposed (2026-10-02). Ships in 1.1.0; the release waits for it.

## Goal

One full-tab page that is KeepKeep's home: everything saved, the lists, the
settings, and the onboarding. Later features (statistics, notes, caption
search, moodboard, influencer shortlist) are added to it as new sections, so
the structure must make adding a section cheap.

Owner's decisions:

- The toolbar popup stays for quick work on Instagram. It gets a clearly
  visible, elegant button that opens the app page in a new tab.
- One structure: some views show on first install (welcome), some after
  updates (what's new), the rest are always there. The separate welcome tab
  and import tab built earlier move into it.
- The app's headline sells the product; the privacy badges are the
  supporting key, never the headline.

## First version (1.1.0)

| View | Address | Shown |
| --- | --- | --- |
| Saved: Profiles | `app.html#profiles` | always |
| Saved: Media | `app.html#media` (default) | always |
| Settings (incl. Backup) | `app.html#settings` | always |
| About | `app.html#about` | always |
| Welcome | `app.html#welcome` | opened on install; from About ("Show the welcome again") |
| What's new | `app.html#whats-new` | opened once after an update that has notes; from About |

Not in the menu until they exist (no "coming soon"): statistics, notes,
caption search, moodboard, influencer shortlist, guided settings.

## Layout

- **Sidebar (left, fixed):** logo + KeepKeep; Profiles and Media with counts;
  under them the lists of the selected kind (counts, drag to reorder, + New
  list, rename / delete on hover); at the bottom Settings and About.
- **Main area:** a top bar with search and filters, then the grid.
- Light and dark like Instagram's own theme (the system setting), the store
  images' look: Inter (bundled), brand purples, soft lilac backgrounds.
- Wide screens: 4–6 columns; narrow windows: the sidebar collapses to icons.

## Saved views

- **Media grid:** square previews (the stored thumbnails), owner and type
  (post / reel / story) on each card, list chips, date added. Click opens the
  post on Instagram in a new tab. Hover: select, lists, download, remove.
- **Profiles grid:** round picture, @username, name, list chips; click opens
  the profile.
- **Search:** usernames, names and list names (captions come later with
  caption search).
- **Filters:** type (All / Posts / Reels / Stories), owner, date added
  (Any time / 7 days / 30 days / This year); sort Newest / Oldest. The list
  is chosen in the sidebar.
- **Selection:** click checkboxes or Shift-click a range; ⌘/Ctrl-A selects
  what's shown. A bar appears: Add to list, Remove from list, Download,
  Remove from KeepKeep (with Undo, like the corner card).
- **Drag to lists:** drag cards onto a list in the sidebar.
- **Live:** saving on Instagram while the page is open shows up at once
  (`chrome.storage.onChanged`).
- Many items: cards render in chunks as you scroll.

## Download from the app page

Instagram's data needs the user's own Instagram session, so downloads run in
an open instagram.com tab, the same way the popup's Download works today
(`chrome.tabs.sendMessage`). If no Instagram tab is open, the bar says so
with an "Open Instagram" button; KeepKeep never opens windows by itself. A
whole selection downloads one post after another, with the usual balloons
in that tab and a progress line on the page.

## Settings

All of the popup's settings (photo size, anonymous stories), Backup (Export,
Import with the file picker on the page; `import.html` goes away and the
popup's Import opens `app.html#settings`), and About. The popup keeps its
settings too, for quick changes.

## Welcome and What's new

- **Welcome** replaces `welcome.html`: same content and order (headline,
  keyword line, three steps, the anonymous-mode note, Open Instagram and
  Settings buttons, trust badges, Zetasis). Shown full width, without the
  sidebar, with "Go to KeepKeep" at the end.
- **What's new:** `WHATS_NEW` in `app/whats-new.js` maps a version to a few
  lines. On update (`onInstalled`, reason `update`) the page opens once, only
  if the new version has notes and it is a minor or major update.

## Popup button

In the popup header, left of the mask and ⚙: a pill button "Open KeepKeep ↗"
(icon + text, brand tint), the most visible control after the logo. Also a
"Open in a tab" row at the bottom of the empty states.

## Code structure (no build step)

```
extension/app.html          shell: sidebar, main, <script>s in order
extension/app.css           layout and shared styles
extension/app/core.js       router (hash → view), sidebar, state, helpers
extension/app/saved.js      Profiles / Media grids, search, filters, selection
extension/app/settings.js   settings, Backup, About
extension/app/welcome.js    welcome view
extension/app/whats-new.js  what's new view + WHATS_NEW notes
extension/fonts/inter.woff2 (already there)
```

Each view registers itself: `KeepKeepApp.view({ id, title, nav, render })`.
A new feature later is a new file plus one `<script>` line. Data goes
through `basket.js` only; the storage format does not change.

## Testing

Playwright, like the rest: each view renders from seeded storage; search,
filters, selection and bulk actions change storage as expected; drag to a
list; Backup round trip in the page; welcome opens on install and what's new
on update (simulated), and not otherwise; the popup button opens the page;
no requests leave the extension except to Instagram (download path).

## Out of scope for 1.1.0

Statistics, notes, caption search, moodboard, influencer shortlist, guided
settings, highlights.
