# Browser tab icon — design

Mockup: [`docs/design/tab-icon-mockup.html`](../../design/tab-icon-mockup.html)
(the three icons considered, each at real size in a light and a dark tab bar;
open it from a checkout after `npm ci` so it picks up the repo's fonts).

## Why

Gubbins has no tab icon. `apps/web/index.html` links none, so browsers show a
blank page or a generic globe. Someone with the list open among a dozen other
tabs can't pick it out at a glance.

The owner wants the icon to do two things:

1. Make the Gubbins tab easy to spot.
2. Look like part of the Gubbins design, the palette of the guest pages
   (see `2026-10-25-guest-storybook-theme-design.md`).

## Goals

- Every page of the web app shows a gift icon in the browser tab: guest
  pages and owner pages alike, since they share `apps/web/index.html`.
- The icon is the drawn gift from the mockup's option B: a moss box with a
  gold ribbon (owner ruling, 2026-11-02).
- It looks the same in every browser and on every device.
- `/favicon.ico` returns the real icon. Today it returns the app's HTML page,
  which tools that fetch that address directly can't use.

## Non-goals

- A phone home-screen icon (`apple-touch-icon`, web app manifest).
- A separate icon for dark mode or dark tab bars. The owner saw option B in a
  dark tab bar, where the moss box is low-contrast and the gold ribbon
  carries it, and chose it anyway.
- Changing the page title. It stays "Gubbins".
- PNG icons, or more ICO sizes than the three below.
- Changing how the server answers other missing paths. Unknown paths keep
  returning `index.html`; only `/favicon.ico` gains a real file.

## Anti-goals

- **Using the 🎁 emoji.** The emoji was the starting idea (option A). It was
  dropped because every platform draws it differently and none uses the
  Gubbins colours. The icon must not depend on an emoji font, including
  emoji text inside an SVG.
- **Linking to anything outside the repo.** The icon is a file the app
  serves itself, with no CDN, external font or remote image.

## The icon

Colours are the guest palette tokens: **moss `#34603F`** for the box and
lid, **gold `#D9A93A`** for the ribbon and bow. There is no background,
outline or other colour.

The shape on a 32 × 32 grid, as drawn in the mockup:

| Part | Shape | Colour |
|------|-------|--------|
| Box | rect x=5 y=15 w=22 h=14, corner radius 1.5 | moss |
| Lid | rect x=3 y=9 w=26 h=5, corner radius 1.5 (a 1-unit gap above the box shows the tab bar) | moss |
| Ribbon | rect x=14 y=9 w=4 h=20 | gold |
| Left loop | path `M16 9C12 2.5 5.5 4 8 8.2 9.2 10 13 9.3 16 9Z` | gold |
| Right loop | path `M16 9C20 2.5 26.5 4 24 8.2 22.8 10 19 9.3 16 9Z` | gold |

The mockup draws the same shapes from CSS variables. The shipped file uses
literal `fill` colours, because a favicon has no page CSS to inherit from.

## Files and tags (decided)

Two files, both in `apps/web/public/`, which Vite copies into the build
output as-is:

- **`favicon.svg`**: a standalone SVG with `viewBox="0 0 32 32"`, drawn as
  above. Current Chrome, Edge, Firefox and Safari 26 (macOS and iOS, from
  September 2025) show it in the tab.
- **`favicon.ico`**: the same drawing exported at 16, 32 and 48 pixels with a
  transparent background. It covers Safari 18 and earlier, which can't show
  SVG icons, and tools that ignore the `<link>` tags and request
  `/favicon.ico` directly. Some of those also ignore SVG and read only the
  first icon a page declares, which is why the ICO comes first.

Two lines in `apps/web/index.html` inside `<head>`, in this order:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
```

- The explicit `sizes="32x32"` on the ICO matters. Without a size, or with
  `sizes="any"`, Chrome tends to pick the ICO over the SVG.
- The SVG goes last because browsers use the last of several equally
  suitable icons.
- I left `sizes="any"` off the SVG (my call). Reports say it makes no
  difference there.

## How it's served (decided)

- In production, Fastify serves the built web app with `@fastify/static`
  (`apps/api/src/presentation/app.ts`), which registers a route for each file
  in the build output at startup. Both icons are served from there, before
  the SPA fallback that returns `index.html` for unknown paths. No server
  change is needed.
- In dev, Vite serves `public/` at the root.

## Keeping the two files in step

`favicon.svg` is the source. The ICO is exported from it once and committed
as a binary. The exporting tool is not added to `package.json` and there is
no build step. If the drawing changes, re-export the ICO in the same change.
A tested recipe with ImageMagick 7 (on version 6, use `convert` in place of
`magick`):

```sh
for s in 16 32 48; do
  magick -background none -density 512 favicon.svg -resize ${s}x${s} -strip PNG32:icon-$s.png
done
magick icon-16.png icon-32.png icon-48.png favicon.ico
magick identify favicon.ico   # lists 16, 32 and 48
```

Browsers cache favicons separately from pages, and Safari ignores query
strings when it does. If the icon changes after launch, give the new file a
new name rather than adding `?v=2`, and expect Safari and search results to
lag. This first version needs neither, since there is no old icon to
replace.

## Left to the builder

- **Where to run the export.** The dev container has no image tool
  (ImageMagick, `rsvg-convert` and `icotool` are all missing). Run the recipe
  anywhere ImageMagick is available, or use another tool that gives the same
  result. Don't add the tool to the repo.
- **Tests.** My call: no automated test. Nothing here makes a decision that
  code owns: it's two static files and two tags. Check it by hand:
  - Open `favicon.ico` once and confirm the background is transparent at
    every size.
  - `npm run dev`: the tab shows the gift. In Chrome's Network tab, the SVG
    is the icon fetched, not the ICO.
  - A production build served by the API: `GET /favicon.svg` returns
    `image/svg+xml` (Firefox needs that type), and `GET /favicon.ico`
    returns an icon type. Neither returns `index.html`.
- **SVG tidiness.** Keep the file hand-written and small: no editor metadata,
  no `<style>` block, no `id`s beyond what the shapes need.
