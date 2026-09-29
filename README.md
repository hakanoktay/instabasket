# KeepKeep

A Chrome extension that lets you drag Instagram profiles and posts into a "basket".

## How it works

- While on `instagram.com`, drag the URL from the address bar (or a profile/post link on the page) over the page.
- A card appears in the top-right corner; drop the link on it.
- Or use the icons at the top of the extension's popup: **Profile**, **Media** and **Download** act on the post or profile open in the current tab (⚙ opens the settings).

There are also **🧺 Add to basket** buttons on Instagram itself:

- **Profile**, **Media** and **Download** icons in every post's action bar, just left of Instagram's save icon (home feed, post page and post popup),
- in the corner of post thumbnails when you hover them (profile grid, explore),
- next to the Follow button on profile pages,
- in the Reels viewer, icons at the top of the right-hand icon column: **Profile** adds the reel's owner, **Media** adds the reel itself, **Download** downloads it.

Once an item is saved its button shows **✓ In basket**. Hovering it turns it into a red **Remove** (like "Following" → "Unfollow" on Instagram); clicking removes the item, and the corner card offers **Undo** for a few seconds.

### Downloading

**Download** saves every photo and video of a post in the highest resolution Instagram offers. Files are named after the owner and the time the post was published, e.g. `telma_2507271432.jpg` (YYMMDDHHmm); album items get a number: `telma_2507271432_1.jpg`, `telma_2507271432_2.mp4`.

Files go straight to `Downloads/KeepKeep/`, each photo and video as its own file – no ZIP, no questions, no windows.

Photos come in their uploaded size (up to 3072 px, found on the post's embed page) or, if you pick **Standard** in the popup's settings (⚙), in the largest size Instagram shows (up to 1080 px). If the original can't be fetched, the standard size is used.

While downloading, balloons on the right show the overall progress and each photo / video with its thumbnail, size and progress; they disappear a few seconds after it's saved.

### Video controls

Every video (feed, post page, post popup or Reels) always shows a thin scrubber along its bottom edge (click or drag to any point; hover shows the time there) and a play / pause button next to Instagram's mute button. Instagram's own username, Follow button and caption stay clickable, and the controls hide while something (like a post popup) covers the video. (Not shown in Stories.) While the mouse is over a video, **← / →** skip 5 seconds and **Space** or **K** play / pause; elsewhere those keys keep doing what Instagram uses them for.

### After adding

Everything you add is saved right away. The corner card then shows what was added and, below it, your lists as large boxes that slide open. Click boxes (or press **1–9**) to put the item into those lists, or create a new list from the **+ New list** box. With many lists a search field appears and the boxes scroll. The card closes on its own after a few seconds; a bar at the bottom shows the time left, and it pauses while your mouse is over the card.

The basket has two independent sections:

- **Profiles:** accounts you add on purpose (profile link, profile page button, or the Reels **Profile** icon).
- **Media:** posts, reels and videos. Each item is grouped under its owner with the owner's picture, but adding media **does not** add the owner to Profiles. Use **+ Profile** on a media group to add the owner later if you want.

Removing a profile keeps its media, and vice versa.

### Lists

Profiles and media each have their own lists (e.g. profile lists "Designers", "Friends"; media lists "Fashion", "Inspiration"). One item can be in several lists.

- Create a list with the **+** button at the right end of the list row.
- Click a list to show only what's in it; **All** shows everything. With many lists the row scrolls sideways: use the arrow buttons, the mouse wheel or a trackpad.
- While a list is selected, the bottom bar shows its name with **Rename** and **Delete list**. Deleting asks for confirmation and keeps the list's items in your basket.
- Use the tag button on a profile or media thumbnail to pick its lists.
- On Instagram, right after adding something, the corner card shows the matching lists so you can file the item immediately.

In the popup, profile pictures and usernames are links: right-click → *Open link in new tab* opens the profile. A normal click on a username in Media shows only that user's media.

Profile pictures and cover images are stored inside the extension as small thumbnails, so they keep showing even after Instagram's image links expire. If some detail can't be fetched at the moment (network error, etc.), it's filled in in the background the next time you open Instagram.

## Installation

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `extension` folder.
5. Reload any open Instagram tabs.

After updating the extension, click its reload (⟳) button on `chrome://extensions` and reload your Instagram tabs.

## Roadmap

Planned features are listed in [ROADMAP.md](ROADMAP.md).
