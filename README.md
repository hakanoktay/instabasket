# InstaBasket

A Chrome extension that lets you drag Instagram profiles and posts into a "basket".

## How it works

- While on `instagram.com`, drag the URL from the address bar (or a profile/post link on the page) over the page.
- A **🧺 Drop into basket** box appears in the top-right corner; drop the link there.
- Instead of dragging, you can also click the extension icon and use **+ Add this page**.

The basket has two sections:

- **Profiles:** Dropping a profile link adds the profile with its picture and name.
- **Media:** Dropping a post, reel or video link (e.g. `instagram.com/p/CODE/?img_index=1`) looks up the post's owner and files it under that user. If the owner isn't in Profiles yet, they're added automatically.

Profile pictures and cover images are stored inside the extension as small thumbnails, so they keep showing even after Instagram's image links expire. If some detail can't be fetched at the moment (network error, etc.), it's filled in in the background the next time you open Instagram.

## Installation

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `extension` folder.
5. Reload any open Instagram tabs.

After updating the extension, click its reload (⟳) button on `chrome://extensions` and reload your Instagram tabs.
