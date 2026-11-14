# The owner picks a list style — design

Mockup: `docs/design/groovy-list-style-mockup.html` (open it in a browser).

## Why

Every list looks the same: the Storybook look (lilac paper, plum ink, moss buttons, IM Fell English headings). The owner wants a second look, "Groovy", that a list owner can choose for their list. Guests then see the list in that style.

## Goals

- Two list styles: **Storybook** (today's look, the default) and **Groovy** (a 70s look: mustard-cream paper, chocolate ink, avocado buttons, burnt-orange accents, Shrikhand headings).
- The owner picks the style when editing the list's details on the manage page.
- Guests see the list page in the owner's chosen style, and so does the owner on the manage page.
- Every existing list stays Storybook when this ships. Nothing visibly changes on deploy.

## Non-goals

- Picking a style when creating a list. New lists are Storybook; the owner can change it afterwards.
- The guest key screen and the owner token screen. The key screen shows before the guest has entered a key, so the page doesn't know the list yet. Both stay Storybook, including when a session ends and the page still holds the list it showed before.
- Groovy-only shapes and treatments from the mockup: the rainbow arch round the door, the sunburst seals, the striped jar, pill-shaped buttons and inputs, and the cream "Your holds" panel. Only colours, the heading font, the list's name and the rule under it change: a Groovy list shows its name in burnt orange (wax) and draws that rule as three rounded stripes (burnt orange, gold, avocado) in place of the vine. The seals and the jar keep their shapes and pick up the Groovy colours where they already use theme colours.
- Pages that aren't about one list (home, create, privacy, not found).
- More styles, custom colours, or a per-guest style.

## How it looks

The Groovy values replace the Storybook values of the same names in `apps/web/src/index.css`. Components keep using the same classes (`bg-paper`, `text-moss` and so on). The one addition is a `list-title` token for the list's name on the guest page (ink in Storybook), so a style can colour it.

| Token | Storybook | Groovy |
|---|---|---|
| paper | `#F6F3FB` | `#FBEBC8` |
| ink | `#2E2447` | `#3A2212` |
| muted | `#625A78` | `#7A5232` |
| line | `#DCD3EA` | `#E9CF98` |
| moss | `#34603F` | `#5C6B1A` |
| petal | `#F2CBD6` | `#F4B183` |
| gold | `#D9A93A` | `#E8A317` |
| wax | `#9E2A45` | `#B4441A` |
| brass | `#8C6A4A` | `#8A4B1C` |
| error | `#B42335` | `#B42335` (unchanged) |
| list-title (the list's name on the guest page) | ink | wax |
| display font | IM Fell English | Shrikhand |

White text on moss and wax, ink and muted on paper, moss links on paper, and the list's name on paper (wax on Groovy paper is 4.71:1) all meet WCAG AA (4.5:1) in both styles. Shrikhand is self-hosted from `@fontsource/shrikhand`, like the other fonts, so guests' browsers never contact a font CDN.

The style applies to the whole page, footer included: the page sets `data-list-theme="groovy"` on the `<html>` element while the list or manage page is shown, and removes it when the owner or guest leaves that page.

## Owner experience

The list details edit form (`EditListDetailsForm`) gains a **List style** choice below "About this list": two radio buttons, **Storybook** and **Groovy**, with the current style selected. Saving the form saves the style with the title and description. Cancel leaves it unchanged. The manage page switches to the new style once the save finishes.

## API and storage

- `wishlists.theme text not null default 'storybook'`, added by migration `0004_wishlist_theme`. Every existing row becomes `storybook`. There is no CHECK on the value; the domain owns the set of styles.
- The domain calls it `ListTheme`, one of `'storybook' | 'groovy'`. `Wishlist.create` always starts at `storybook`. `Wishlist.changeTheme(theme)` refuses any other value with a `DomainValidationError`.
- `GET /api/lists/:slug` (the guest view) and the manage view both return `theme`.
- The edit-list-details request requires `theme`, like its other fields (edit requests have no optional fields). An unknown value answers 400.
- Changing the style is an owner edit, like editing the title. It is not a ledger event and leaves no record.

## Open decisions for the owner

None. The owner ruled on 2026-11-13: pick the style only when editing (not on create), both the guest and manage pages show it, the picker is labelled "List style" with options "Storybook" and "Groovy", and Storybook is the default. On 2026-11-14 the owner added the striped line under the list title, and the list's name in wax, for Groovy.
