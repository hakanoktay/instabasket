# Publishing KeepKeep on the Chrome Web Store

Everything needed for the store is in this folder:

| File | What it is |
| --- | --- |
| [`listing.md`](listing.md) | Name, summary, description, category and which image goes where |
| [`privacy-practices.md`](privacy-practices.md) | Single purpose, permission justifications, remote code, data usage, privacy policy URL |
| [`assets/`](assets/) | Five 1280 × 800 screenshots, the 440 × 280 small promo tile and the 1400 × 560 marquee |
| [`../docs/privacy.html`](../docs/privacy.html) | The privacy policy page (published with GitHub Pages) |
| [`../scripts/package.sh`](../scripts/package.sh) | Builds the ZIP to upload |

## Steps

1. **Developer account.** Sign in at the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   with the Google account that will own KeepKeep, pay the one-time US$5
   registration fee, turn on 2-step verification and verify the contact email.
2. **Privacy policy online.** In the GitHub repository: **Settings → Pages →
   Deploy from a branch → `main` / `docs`** → Save. Check that
   `https://hakanoktay.github.io/instabasket/privacy.html` opens.
   (The store changes need to be on `main` for this.)
3. **Build the package.** From the repository folder:

   ```sh
   ./scripts/package.sh
   ```

   It checks the manifest and writes `dist/keepkeep-<version>.zip`.
4. **New item.** In the dashboard: **Items → New item** → upload the ZIP.
5. **Store listing tab.** Copy the texts from [`listing.md`](listing.md) and
   upload the images from [`assets/`](assets/) as listed there.
6. **Privacy tab.** Copy the answers from
   [`privacy-practices.md`](privacy-practices.md).
7. **Distribution tab.** Public (or Unlisted to try it first), all regions,
   free.
8. **Submit for review.** Because KeepKeep asks for access to Instagram's
   sites, the review is more thorough than usual: usually a few days,
   sometimes up to three weeks. You get an email either way.

## Updating later

Raise `version` in `extension/manifest.json`, run `./scripts/package.sh` again
and upload the new ZIP under **Package → Upload new package**. If a new
version handles data differently (for example kept story copies), update
`docs/privacy.html` and the Privacy tab **before** submitting it.

## About the screenshots

They show KeepKeep's real interface, captured from the extension itself, on
Instagram-like demo pages with made-up accounts and generated landscape
pictures, so no real person's photos and no Instagram logo appear in the
listing.
