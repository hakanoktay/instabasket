# Chrome Web Store — Privacy practices tab

Answers for the **Privacy** tab of the Developer Dashboard, in the order the
dashboard asks for them. Each text box is ready to paste. Reviewers compare
these answers with the code and the privacy policy, so they describe exactly
what KeepKeep does — no more, no less.

---

## Single purpose description

```
KeepKeep is a companion for browsing instagram.com: it lets you keep the profiles, posts and stories you find there – save them into your own lists, download them, and view them on your terms (anonymous story viewing and better video controls).
```

---

## Permission justifications

### storage

```
Saves the user's own KeepKeep data locally in the browser: the profiles and posts they chose to keep, their lists and their settings. Nothing is synced or sent anywhere.
```

### unlimitedStorage

```
Each saved profile and post keeps a small preview image (profile picture or post thumbnail) so the user's lists still show pictures after Instagram's image links expire, which they do within days. With a few hundred saved items these previews exceed the default 10 MB local storage quota. All of it stays on the user's computer.
```

### downloads

```
When the user clicks Download, the photos and videos of that post or story are saved to the user's Downloads folder (Downloads/KeepKeep) with readable file names. Nothing is downloaded without the user asking.
```

### offscreen

```
The background service worker cannot turn fetched media into downloadable files or report download progress by itself. A hidden offscreen document fetches the photos and videos the user asked to download, shows per-file progress, and hands them to chrome.downloads.
```

### Host permission justification

(One text box covers all host permissions and the content scripts.)

```
instagram.com: KeepKeep only works on Instagram. Its content scripts add the Profile, Media and Download buttons next to posts, reels, stories and profiles, read which post or profile is on screen, and ask Instagram for that post's details (owner, pictures, videos) the same way the site itself does, using the user's own session. When the user turns on anonymous story viewing, a script on instagram.com answers the "story seen" request locally instead of sending it; all other requests are left untouched.

*.cdninstagram.com and *.fbcdn.net: these are Instagram's media servers. KeepKeep downloads the photos and videos the user asks for from them, and makes the small preview images for saved items.

No other sites are accessed.
```

---

## Are you using remote code?

**No, I am not using remote code.**

(All JavaScript is inside the package; nothing is loaded from the network,
there is no `eval`, and the extension uses Manifest V3's default content
security policy.)

---

## Data usage

**What user data do you plan to collect from users now or in the future?**

Tick only:

- [x] **Website content** — the profiles and posts the user chooses to keep
  (usernames, display names, links, small preview images). Stored locally in
  the browser only.

Leave everything else unticked. KeepKeep never collects personally
identifiable information, health, financial or authentication information,
personal communications, location or web history. It watches the pointer and
a few keys only to show its buttons and shortcuts (for example, pressing D to
download a story); nothing is recorded, stored or sent.

**Certifications** — tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the
  approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

---

## Privacy policy URL

```
https://hakanoktay.github.io/keepkeep/privacy.html
```

The page is [`docs/privacy.html`](../docs/privacy.html). To publish it:
GitHub → repository **Settings → Pages → Build and deployment → Deploy from a
branch**, branch **main**, folder **/docs** → Save. After a minute the page is
at the address above. (GitHub Pages is free for public repositories; for a
private one, publish the same file on any public web address instead, such as
your own site.)

---

## If a reviewer asks

Short answers to the questions reviewers most often send extensions like this:

- **Why does it read instagram.com pages?** To place its buttons and to know
  which post, profile or story they act on.
- **Does it collect browsing data?** No. It runs only on instagram.com, and
  what it saves is what the user explicitly chose to keep, stored only in the
  user's browser.
- **Why does it change requests on instagram.com?** Only when the user turns on
  anonymous story viewing, and only the one request that marks a story as seen;
  the user can switch this off at any time in the settings.
- **Does it download content automatically?** No. Every download starts with a
  click by the user, and saves to the user's own Downloads folder.
