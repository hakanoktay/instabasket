# Chrome Web Store listing — KeepKeep

Everything to paste into the Chrome Web Store Developer Dashboard, tab by tab.
Images are in [`assets/`](assets/); the permission and privacy answers are in
[`privacy-practices.md`](privacy-practices.md).

---

## Store listing tab

### Name

```
KeepKeep – Downloader & Anonymous Story Viewer for Instagram
```

(From `manifest.json`, where the store takes it from; 60 characters, the limit
is 75. Inside the extension and on the toolbar it is just "KeepKeep"
(`short_name`). "Instagram" may appear in the name only at the end, as "for
Instagram"; never "Insta" or "Gram". No Instagram logo or look-alike in the
icon or the images, and the description keeps its "not affiliated with
Instagram or Meta" note. `scripts/package.sh` checks these rules.)

### Summary (short description, max. 132 characters)

```
Save posts to your lists, download in full quality, watch stories anonymously. No password. Your data never leaves your computer.
```

(129 characters; the same text is the `description` in `manifest.json`, which
the store shows when the summary field is left empty.)

### Description

Paste as plain text — the store keeps line breaks but shows no Markdown.

```
Never asks for your password. Your data never leaves your computer.
KeepKeep works inside the Instagram tab you're already signed in to – no login, no account, no servers. We never see what you save.

Reels, Stories, Photos, Videos and Posts – save them to your own lists or download them in full quality.

KeepKeep is a quiet companion for instagram.com. It puts a few purple buttons right where you already look – next to posts, reels and stories – so you can keep what you find, organise it your way and save it in full quality.

PRIVATE BY DESIGN
• Never asks for your Instagram username or password – it simply works in the tab where you're already signed in.
• Everything you save stays in your browser, on your computer. We never receive it.
• No account, no servers, no analytics, no ads.
• KeepKeep only talks to Instagram, on your behalf, to show and save what you ask for.

KEEP PROFILES AND POSTS
• One click next to any post, reel, story or profile saves it to KeepKeep.
• Or drag an Instagram link onto the page.
• Right after saving, a small card lets you drop it into one of your lists or start a new one – keys 1–9 work too.
• Profiles and media each have their own lists; rename or delete them any time.
• Saved something by mistake? Point at its button and click to remove it – Undo is one click away.

DOWNLOAD IN FULL QUALITY
• Every photo and video of a post – the whole album – with one click.
• Photos in the size they were uploaded, or Instagram's standard size if you prefer smaller files.
• All of an account's current stories at once.
• Files are saved to Downloads/KeepKeep and named after the account and the date, so they sort nicely. Progress bubbles show every file.

WATCH STORIES ANONYMOUSLY
• On from the start: you won't appear in the story's viewers list. Switch it off any time in the popup.
• Like a private window, Instagram then wears KeepKeep purple, so you always know the mode is on.
• A heads-up appears before you reply or react, because the owner still sees those.

SKIP THROUGH ANY VIDEO
• A thin scrubber on every video lets you jump anywhere; play / pause sits right next to Instagram's mute button.
• ← and → skip 5 seconds, Space or K plays and pauses.

GOOD TO KNOW
• KeepKeep works on instagram.com in Chrome on your computer.
• Please respect creators: download only what you have the right to save.
• KeepKeep is an independent project. It is not affiliated with, endorsed or sponsored by Instagram or Meta. Instagram is a trademark of Instagram, LLC.
```

### Category

**Social & Communication.** If the dashboard shows the newer category list,
choose **Social networking**.

### Language

**English**

### Graphic assets

| Field | File | Size |
| --- | --- | --- |
| Store icon | `extension/icons/icon128.png` | 128 × 128 |
| Screenshot 1 | `assets/screenshot-1-keep.png` | 1280 × 800 |
| Screenshot 2 | `assets/screenshot-private.png` ("Private by design"; made by `scripts/store-private.mjs`) | 1280 × 800 |
| Screenshot 3 | `assets/screenshot-2-lists.png` | 1280 × 800 |
| Screenshot 4 | `assets/screenshot-3-download.png` | 1280 × 800 |
| Screenshot 5 | `assets/screenshot-4-anonymous.png` | 1280 × 800 |
| Screenshot 6 | `assets/screenshot-5-video.png` | 1280 × 800 |

The store takes at most 5 screenshots: one of these six stays out (owner's choice, still open).
| Small promo tile (required) | `assets/promo-small-440x280.png` | 440 × 280 |
| Marquee promo tile (optional) | `assets/promo-marquee-1400x560.png` | 1400 × 560 |

The screenshots use made-up accounts and generated pictures, so no real
person's photos or Instagram's logo appear in the listing.

### Additional fields

- **Official URL:** leave empty (it needs a verified domain).
- **Homepage URL:** `https://github.com/hakanoktay/keepkeep` (or the GitHub
  Pages address below).
- **Support URL:** `https://github.com/hakanoktay/keepkeep/issues`
- **Mature content:** No.

---

## Privacy tab

See [`privacy-practices.md`](privacy-practices.md): single purpose, one
justification per permission, remote code, data usage and the privacy policy
URL.

---

## Distribution tab

- **Visibility:** Public (or *Unlisted* first, to try the store version with a
  link before everyone can find it).
- **Regions:** All regions.
- **Payments:** Free.
