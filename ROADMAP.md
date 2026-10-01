# Roadmap

Features planned for upcoming versions of KeepKeep.

## Planned

### Next version: "Never asks for your password" (top priority)

A tester's feedback: the biggest worry with extensions like this is that they ask for your Instagram username and password, and many people won't install one for fear it will. KeepKeep never asks, never sees and never stores them (it works inside the user's own logged-in instagram.com tab), so say so loudly:

- **Store screenshots:** a new first screenshot (and the small promo tile) built around it, e.g. "No login. No password. Ever." with a short line on why: KeepKeep works in the Instagram tab you're already signed in to.
- **Store description:** open with it, before the features.
- **First run:** after installing, open a short welcome tab (`chrome.runtime.onInstalled`) that says it first, then shows how to use KeepKeep in three steps and links to instagram.com. Shown once, only on install, not on updates.
- **Popup and website:** a short "Never asks for your password" note in the popup (e.g. the empty state) and on the GitHub page.

### Next version: list card polish (owner's request)

The "Add to a list" card that appears after saving (`extension/panel.js`):

- **Reorder lists by drag and drop** right in the card; the new order is saved and used everywhere (card, popup, keys 1–9).
- **Remove the small order numbers** in the top-right corner of each list box. Keys 1–9 keep working in the list order; the "Press 1–9" hint stays as the only mention.

### Next version: Export & import (owner's request)

Users change computers or want their lists on a second one. Everything is stored only in the browser, so:

- **Export** in the settings: one `.json` file with all profiles, media, lists (with their order), settings and the preview images, saved to `Downloads/KeepKeep`.
- **Import** the file on another computer: merges without duplicates (same profile / post is matched and its lists combined); a short summary afterwards ("Added 42 profiles, 3 lists").
- Later, maybe: automatic sync between computers. Chrome's own sync storage is far too small for the preview images, so it would need the user's Google Drive (an extra permission) — export / import first.

### Next version: remove the old "basket" wording (must do)

Leftovers from the InstaBasket days that users still see:

- The profile page button says **"Add to basket"** / **"In basket"** with the basket icon (`buttons.js`, the default label and icon of `makeButton`). Make it match the rest: "Profile" / KeepKeep wording and icon.
- Tooltips: "Add this profile / post / reel to basket", "In basket · click to remove" (`buttons.js`).
- Popup: "Its items stay in your basket.", "use the basket buttons", "Delete from basket" (`popup.js`).
- Drop zone "Drop to add to basket" and "Removed from basket" (`panel.js`).
- `README.md` ("Add to basket", "In basket", "The basket has…").

Use "KeepKeep" or "saved" instead (e.g. "Save to KeepKeep", "Saved", "Remove from KeepKeep"). Internal names (`basket.js`, storage keys) stay as they are, so saved data is not affected. Afterwards search the whole extension for "basket" once more.

### Next version: "Made by Zetasis" and a support link (owner's request)

KeepKeep is developed by Zetasis. Show it, without ads and without getting in the way:

- **Popup footer:** a small, quiet line at the bottom, exactly "Made by Zetasis · ☕ Buy me a coffee" (wording chosen by the owner), linking to Zetasis's website and the owner's coffee / support page. Visible every time, never a pop-up, never blinking.
- **Settings:** an "About" row with the version, the Zetasis link, the support link and the privacy policy.
- **Welcome tab** (first run) and the GitHub page: the same two links at the end.
- Only inside KeepKeep's own UI, never on Instagram's pages. Plain links and bundled images only (nothing loaded from the internet, no tracking). The store texts' "no ads" stays true; mention the optional support link in the description.
- Support page: https://buymeacoffee.com/zetasis (payouts set up). Still needed from the owner: the Zetasis website address (until then the "Zetasis" link can point to https://hakanoktay.github.io/keepkeep/).

### Next version: card flicker when adding again (owner's report, must fix)

Sometimes, right after clicking Profile / Media, the "Add to a list" part of the card shows, slides up and then opens down again – a visible blink. It only happens when the card from the previous add is still on screen.

Cause (found in `extension/panel.js`): the card is reused. `showBusy()` calls `closePicker()`, which removes `.open` from `.picker`, so the picker *animates* closed (grid-template-rows transition, 0.32 s) while the spinner shows; a moment later `showResult()` adds `.open` again and it animates open. Fix: when the card goes busy while the picker is open, don't animate the collapse – either keep the picker as it is until the new result replaces its content, or collapse it instantly (no transition for that one change) – so a second add looks exactly like the first. Check with a test that adds twice in a row, quickly, and records the picker's height over time (it must never shrink and grow again).

### Next version: a searchable store name (owner's request)

People search the store for "instagram download", "anonymous story viewer"… and a bare "KeepKeep" doesn't match. Use the common, accepted pattern *Brand + "for Instagram"* (like "Inssist – Web Client for Instagram"): `name` in `manifest.json` (max 75 characters), e.g.

- **KeepKeep – Save, Download & Anonymous Stories for Instagram** (61, recommended)
- KeepKeep – Save, Download & Anonymous Story Viewer for Instagram (66, matches "story viewer" searches)

Final wording is the owner's choice. Keep it safe: "Instagram" only as "for Instagram" at the end, never "Insta" / "Gram", no Instagram logo in the icon or images, keep the "not affiliated with Instagram or Meta" note; set `short_name` to "KeepKeep" (toolbar, menus). Update `store/listing.md`, the store images' text if needed, `docs/` and the README.

### Already under way

- **Video "Original" quality** – Instagram serves videos as a single file only up to ~720p; the 1080p version comes as separate video and audio streams (DASH). Download both and join them into one standard MP4 inside the extension; fall back to the single file if anything fails.
- **Highlights** – the story buttons (Profile / Media / Download) on highlights too, with "download the whole highlight".
- **Kept story copies** – stories disappear after 24 hours, so a story added to Media keeps its own copy in the extension (only on this computer). Media shows "Story · 18h left", later "Kept copy"; an expired story opens in KeepKeep's own viewer with a Download button. Settings show how much space the copies use, with "Delete copies".
- **One Quality setting** – Original / Standard for photos, videos and stories alike.

### Library page

KeepKeep in a full browser tab: all saved profiles and media in a large grid, with search, filters (list, type, owner, date), multi-select, moving items between lists, removing in bulk and downloading a whole list at once.

### New-post badges for saved profiles

When saved profiles post something new or add a story, a badge appears on the toolbar icon and next to the profile in the popup – a small feed of only the people you chose. Checks are light and spaced out so Instagram's rate limits are never hit.

### Profile change history

For saved profiles, remember earlier names, bios and profile pictures and show them as a timeline, so a renamed or changed account is still recognisable.

### Full-size viewer

Click a photo to open it at its original size, with zoom; view profile pictures in HD. Also helps when reading Instagram zoomed in.

### Focus mode

Hide suggested posts, ads and like counts in the feed; switched on and off in the settings.

## Under consideration

Ideas to think through before they're planned.

### Insights (statistics for social media professionals)

Like SEO toolbars on search results: numbers next to profiles and posts while browsing Instagram. Built on the data Instagram already loads for the page (read in the page, like anonymous stories), so it adds next to no requests and never trips rate limits; everything is computed locally.

- **Profile bar** under the profile header: engagement rate ((likes + comments) / followers) with a low / normal / good label for the account's size, average and median likes and comments, Reels views and views per follower, posts per week and days since the last post, content mix (Reels / albums / photos) and which performs best.
- **Post badges** on the profile grid: "×2.3" or "ER 4.1%" against the account's average (green above, grey below); on hover likes, comments, views and the exact date.
- **Growth tracking** for saved profiles: daily follower counts, 7- and 30-day change with a chart (history starts when the profile is saved; shares the snapshots with *Profile change history*).
- **Full report** (library page): best day and hour to post, top hashtags and the best-performing ones, sponsored share ("Paid partnership", #ad…) and the brands tagged most, an estimated value per post (clearly marked as an estimate), audience-quality signals (engagement far too low for the follower count, sudden follower jumps) shown as a warning, not a verdict.
- **Compare and export:** 2–4 profiles side by side; CSV export and a PDF / image report for clients.

A candidate for a Pro plan.

## Done

### Stories (0.12.x)

Profile, Media and Download in a small pill on the story (shown on hover); Download saves all of the account's current stories at once, and D does the same. Instagram's "will be able to see that you viewed their story" gate is answered: "Watching anonymously" while the mode is on, a "View anonymously" button while it's off.

### Anonymous stories and the veil (0.10–0.11)

Watch stories without appearing in the viewers list (`extension/stories-main.js`). While it's on, Instagram "wears the veil" like a private window: KeepKeep purple instead of Instagram blue, purple story rings with mask badges, a mask capsule, a purple story stage, reply / reaction heads-ups and a masked toolbar icon (`extension/veil.js`, `extension/veil.css`).

### Original-size photos (0.9)

Photos in their uploaded size (up to 3072 px), found on the post's embed page, with a Standard option in the settings.

### Download (0.6.x)

Download button next to Profile / Media on posts and reels: every item of the post in the highest resolution, saved as `<username>_<YYMMDDHHmm>[_<n>].<ext>` in `Downloads/KeepKeep/`; each item as its own file, with per-item progress balloons.

### Video controls (0.5.0)

Instagram's web player has no way to skip forward or back in a video. KeepKeep adds an always-visible thin scrubber along the bottom edge of every video (feed, post page, post popup, Reels) and a play / pause button next to Instagram's mute button, plus ← / → and Space / K for the hovered video. See `extension/video.js`.
