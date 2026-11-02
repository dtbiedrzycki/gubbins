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

## Non-goals

- A phone home-screen icon (`apple-touch-icon`, web app manifest).
- A separate icon for dark mode or dark tab bars. The owner saw option B in a
  dark tab bar, where the moss box is low-contrast and the gold ribbon
  carries it, and chose it anyway.
- Changing the page title. It stays "Gubbins".
- A raster fallback (`favicon.ico` or PNG). Browsers that can't show an SVG
  icon keep today's blank icon (my call; see "Left to the builder").

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

## How it's served (decided)

- **One file: `apps/web/public/favicon.svg`**, a standalone SVG with
  `viewBox="0 0 32 32"`. Vite copies `public/` into the build output as-is.
- **One line in `apps/web/index.html`** inside `<head>`:
  `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.
- In production, Fastify serves the built web app with `@fastify/static`
  (`apps/api/src/presentation/app.ts`), which registers a route for each file
  in the build output at startup. `/favicon.svg` is served from there, before
  the SPA fallback that returns `index.html` for unknown paths. No server
  change is needed.
- In dev, Vite serves `public/` at the root.

## Left to the builder

- **Tests.** My call: no automated test. Nothing here makes a decision that
  code owns: it's a static file and one tag. Check it by hand in both of
  these places:
  - `npm run dev`: the tab shows the gift.
  - A production build served by the API: `GET /favicon.svg` returns the
    SVG with an `image/svg+xml` content type, not `index.html`.
- **Today's `/favicon.ico` requests.** Without a `<link rel="icon">`,
  browsers request `/favicon.ico`, and the SPA fallback answers with
  `index.html`. Once the link exists, current browsers stop asking. My call:
  leave the fallback alone.
- **Older browsers without SVG icon support.** My call: accept today's blank
  icon there, and don't add a `.ico` or PNG. If that turns out to matter, a
  32 × 32 PNG exported from the same SVG is the upgrade.
- **SVG tidiness.** Keep the file hand-written and small: no editor metadata,
  no `<style>` block, no `id`s beyond what the shapes need.
