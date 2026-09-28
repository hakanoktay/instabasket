# InstaBasket

A Chrome extension that lets you drag Instagram profiles and posts into a "basket".

## How it works

- While on `instagram.com`, drag the URL from the address bar (or a profile/post link on the page) over the page.
- A **🧺 Drop into basket** box appears in the top-right corner; drop the link there.
- Instead of dragging, you can also click the extension icon and use **+ Add this page**.

There are also **🧺 Add to basket** buttons on Instagram itself:

- next to the date under every post (home feed, post page and post popup),
- in the corner of post thumbnails when you hover them (profile grid, explore),
- next to the Follow button on profile pages,
- in the Reels viewer, two icons at the top of the right-hand icon column: **Profile** adds the reel's owner, **Media** adds the reel itself.

Buttons turn into **✓ In basket** once the item is saved.

The basket has two independent sections:

- **Profiles:** accounts you add on purpose (profile link, profile page button, or the Reels **Profile** icon).
- **Media:** posts, reels and videos. Each item is grouped under its owner with the owner's picture, but adding media **does not** add the owner to Profiles. Use **+ Profile** on a media group to add the owner later if you want.

Removing a profile keeps its media, and vice versa.

### Lists

Profiles and media can be sorted into lists (e.g. "Fashion", "Inspiration"); one item can be in several lists.

- Create a list by typing a name into **New list…** in the popup.
- Click a list chip to show only what's in it; **All** shows everything. While a list is selected you can rename or delete it (deleting a list keeps its contents).
- Use the 🏷 button on a profile or media thumbnail to pick its lists.
- On Instagram, right after adding something, the corner notice shows your lists for a few seconds so you can file the item immediately.

Profile pictures and cover images are stored inside the extension as small thumbnails, so they keep showing even after Instagram's image links expire. If some detail can't be fetched at the moment (network error, etc.), it's filled in in the background the next time you open Instagram.

## Installation

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `extension` folder.
5. Reload any open Instagram tabs.

After updating the extension, click its reload (⟳) button on `chrome://extensions` and reload your Instagram tabs.
