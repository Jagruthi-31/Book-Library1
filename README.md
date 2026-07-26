# Booked & Planned — V2

The premium rebuild of Booked & Planned. This is a **separate project** from your
live V1 site — nothing here touches that repo, and V1 keeps working exactly as it
does today.

## Status: All 6 phases complete 🎉

| Phase | Scope | Status |
|---|---|---|
| 1 | Design system + Sign in / Sign up | ✅ Done |
| 2 | Home page — greeting, stats, goal ring, continue reading, recommended, recently added, favorites, categories | ✅ Done |
| 3a | Library page — search, filter, sort, grid/table view, edit, delete | ✅ Done |
| 3b | Add a book + Open Library auto-fill + cover/PDF uploads | ✅ Done |
| 4 | In-app PDF reader — zoom, dark/light reading mode, progress, timer | ✅ Done |
| 5 | Dashboard — streak, reading hours, goal setting, monthly & genre charts | ✅ Done |
| 6 | Global search, author filter, performance pass | ✅ Done (this delivery) |

This was the last phase on the original roadmap. See "Where things stand" at the
bottom for what that does and doesn't mean.

## Post-launch updates

Changes made after all 6 phases shipped, in response to actually using the app:

- **Color palette changed to Netflix-inspired** — near-black backgrounds
  (`#0a0a0a`), Netflix red (`#e50914`) as the accent, clean white/gray text.
  Both dark and light themes updated. "Danger" (delete confirmations) was
  deliberately shifted to orange rather than staying red, so it never looks
  identical to the brand accent color on buttons.
- **Fixed: nav link underline.** `<a>` tags never had `text-decoration: none`
  in the base reset, so Home/Library/Dashboard nav links showed the browser's
  default underline. One-line fix.
- **Fixed: PDF rendering quality.** The reader was rendering PDF pages at
  CSS-pixel resolution instead of device-pixel resolution, so every
  Retina/high-DPI screen (most modern phones and laptops) displayed an
  upscaled, slightly blurry page even though nothing was actually wrong with
  the source PDF. Now renders at up to 2.5× device pixel density and displays
  at the same on-screen size — same layout, sharper image.
- **Added: click-to-edit page number in the reader.** The "200 / 247"
  indicator's current-page number is now a button — click it, type a page,
  press Enter (or just click away) to jump straight there. Escape cancels.
- **Fixed: mobile nav overflow.** The top nav (brand + 3 links + search/theme/
  account icons) was never actually checked against phone-width screens, and
  the math didn't work — it was overflowing. Brand text now hides on narrow
  screens (icon stays), link padding tightens, the account chip shows just
  your avatar instead of your full email, and the whole bar scrolls
  horizontally as a fallback if it's ever still tight. This was calculated
  against real phone widths, not visually verified in an actual browser —
  worth a glance the first time you check it on your phone.

## What Phase 6 actually does

- **Global search — Ctrl/Cmd+K from anywhere** (Home, Library, Dashboard). A
  centered overlay, not tucked into one page's toolbar. Empty, it suggests your
  recent searches and your in-progress books; typing searches title and author
  live. Arrow keys + Enter work, same as clicking. Selecting a result is smart
  about intent: a book with a PDF opens straight into the reader, one without
  jumps to its entry in the Library and opens the edit form directly.
- **Search history** — your last 8 searches, shown as tappable chips, with a
  clear option. Recorded when you actually pick a result, not on every keystroke.
- **Author filter** on the Library page, alongside status and genre — genuinely
  useful once you have a few books by the same author (which, given your
  reading list, is often).
- **A real performance pass**, honestly scoped: covers already lazy-load,
  search input was already debounced, and Home's below-the-fold sections
  (Recommended, Recently Added, Favorites, Categories) now use
  `content-visibility: auto` so the browser skips layout/paint work for them
  until they're about to scroll into view. What's **not** here: a service
  worker / offline caching layer. That's real, separate scope, and a poorly
  implemented cache is a classic way to make people see a stale app after every
  future update — not something to bolt on casually at the end of a build.

### A real bug the tests caught

The search overlay's close button reused the `.field-toggle` CSS class for its
positioning (it sits in the same spot a password show/hide button would). But
`app.js` attaches password-toggle *behavior* to every `.field-toggle` element
on the page — so the close button silently inherited broken click behavior
meant for password fields. Fixed by having that behavior only attach to
elements that actually declare what field they toggle, which is also just a
more correct way to write that selector regardless.

## File structure

```
BookLibrary-V2/
├── index.html                  Home page
├── pages/
│   ├── library.html             Library: search/filter/sort/grid/table/Add/Edit/Delete
│   ├── reader.html              In-app PDF reader
│   └── dashboard.html           Streak, reading hours, goal, charts
├── README.md
└── assets/
    ├── css/
    │   └── design-system.css    Every shared style
    └── js/
        ├── supabase-client.js   One shared Supabase client — same project as V1
        ├── auth.js              signIn / signUp / signOut / resetPassword
        ├── toast.js             Shared toast notifications
        ├── app.js               Shared shell: nav, theme, auth modal (not on the Reader)
        ├── books-data.js        Data layer: books CRUD, stats, sessions/streak/charts
        ├── book-card.js         Book card (grid) + book row (table) renderers
        ├── progress-edit.js     The inline "tap the % to update your page" widget
        ├── open-library.js      Open Library search API
        ├── book-form.js         Add/Edit modal
        ├── home.js               Home page controller
        ├── library-page.js      Library page controller (+ author filter, deep-link open)
        ├── reader-page.js       Reader controller
        ├── dashboard-page.js    Dashboard controller
        └── global-search.js     Ctrl/Cmd+K overlay — loaded on Home, Library, Dashboard
```

## Testing

Every phase shipped with an automated pass before delivery. This one: 19 checks
for global search (open/close via button, backdrop, Escape, and Ctrl+K;
suggestions when empty; live search; keyboard navigation; history persistence
and replay; both click-through destinations) plus author filtering and the
`?open=` deep link, plus a final regression sweep confirming Home, Library, and
Dashboard — and specifically, that the password-toggle bugfix didn't disturb
the *real* password toggles it's supposed to still control.

## Your data carries over automatically

`supabase-client.js` points at the **same Supabase project** as V1
(`nctmtedmxlmcmfhtyxyy`), reading the exact same `books` table shape and the
same `book-pdfs` Storage bucket. If you haven't yet, Phase 5 added one optional,
purely additive SQL step for streak/reading-hours tracking — see the git
history of this file or just re-run it, it's harmless either way:

```sql
ALTER TABLE books ADD COLUMN IF NOT EXISTS sessions text DEFAULT '[]';
```

## Local-storage note

V2 uses its own local-only keys (`bp2_library`, `bp2_goal`, `bp2_library_view`,
`bp2_reader_dark`, `bp2_sessions`, `bp2_search_history`) instead of V1's
(`bp_library`, `bp_goal`) — both sites share the same `github.io` origin, so
reusing V1's keys would mean V2 could silently read or overwrite V1's local
data. Cloud data (Supabase) is shared on purpose; local-only data is kept
isolated on purpose.

## Design tokens (for anything you build on top of this)

- Brand gold: `#e8a44a` (your existing accent, carried over)
- Fonts: Playfair Display (display) + Inter (body) — unchanged from V1
- Dark is the default theme; light is a real second theme now, not a re-tint
- Signature motif: a warm "lamplight" radial glow + a thin gilt hairline on card
  tops — used once per screen, not everywhere, on purpose

## Known simplifications (across the whole project)

- No "stay signed in on this device only" toggle.
- Gallery and Tracker are intentionally merged into one Library page with a
  grid/table toggle instead of staying as two separate tabs like in V1.
- The reader has no text selection/copy or page-thumbnail sidebar.
- No offline/service-worker caching layer (see above).
- Reading-session logging only happens from the in-app Reader — a book with no
  PDF attached can't accumulate streak/hours data, since there's no in-app
  reading happening to measure.

## Where things stand

All six phases from the original plan are built, tested, and documented. That
doesn't mean there's nothing left you might want — a few things came up along
the way that got deliberately scoped out rather than silently skipped: text
selection in the reader, a collections/shelves feature, offline support, and a
"stay signed in on this device only" option are the main ones. None of them are
in progress; they're just named, in case any of them turn out to matter more
than they seemed to at the time. Happy to pick any of it up, or call this done.

