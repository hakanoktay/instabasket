# Roadmap

Features planned for upcoming versions of KeepKeep.

## Planned

### Already under way

- **Video "Original" quality** – Instagram serves videos as a single file only up to ~720p; the 1080p version comes as separate video and audio streams (DASH). Download both and join them into one standard MP4 inside the extension; fall back to the single file if anything fails.
- **Highlights** – the story buttons (Profile / Media / Download) on highlights too, with "download the whole highlight".
- **Kept story copies** – stories disappear after 24 hours, so a story added to Media keeps its own copy in the extension (only on this computer). Media shows "Story · 18h left", later "Kept copy"; an expired story opens in KeepKeep's own viewer with a Download button. Settings show how much space the copies use, with "Delete copies".
- **One Quality setting** – Original / Standard for photos, videos and stories alike.

### Library page

KeepKeep in a full browser tab: all saved profiles and media in a large grid, with search, filters (list, type, owner, date), multi-select, moving items between lists, removing in bulk and downloading a whole list at once.

### Backup & restore

Export everything (profiles, media, lists, settings) to one file and import it on another computer; importing merges without creating duplicates.

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
