# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

The redesign preview of the public website for **Matrix Engineering Ltd** — an Isle of
Man manufacturer of creasing matrix and ejection rubber for folding-carton converters
and die-makers. Live domain: `creasingmatrix.com`.

Product ranges referenced throughout: **Phoenix+**, **Phoenix XL**, **Ultra-SR**
(creasing matrix) and **Exceed Rubber** (ejection rubber), plus shim/patching tape
accessories.

This is not a brochure site with a contact form bolted on. It **feeds the factory's
production system through a shared Supabase database** — an order placed in the client
hub lands in the same tables the shop floor works from. Treat anything that writes to
that database as production work, not website work.

## Project rules

These are the standing rules for this project. They override convenience, tidiness and
anything you would normally do by default.

1. **Access is enforced by Postgres row-level security, never in the browser.** Never
   move an access check into client code. The previous version compared a PIN in
   JavaScript against a table the browser could read, which exposed every customer's
   orders.
2. **Staff are `@creasingmatrix.com` accounts.** Customers get a Supabase Auth account
   linked to a company in `portal_users`, and see only their own orders. Both
   determinations are made in the database, not here.
3. **The product catalogue is generated from the factory system's own list.** Never
   retype sizes by hand. The two drifted apart before and orders arrived that the
   factory couldn't match to stock.
4. **Line descriptions must keep the exact format `buildLineDescription()` produces**,
   because the factory system parses that string.

The sections below are the detail behind these rules.

## Build, run, test

There is none of any of these. No package.json, no bundler, no dependencies to install,
no test suite. Three flat files are the deliverable, plus a standalone brochure page.

To check a change, serve the directory and open it — do not open `index.html` over
`file://`, because Supabase Auth's session storage and the fonts/CDN requests behave
differently on an opaque origin:

```
python3 -m http.server 8000    # then http://localhost:8000
```

Deployment is a manual file upload through the GitHub web UI (the entire history is
"Add files via upload" / "Delete <file>" pairs). Assume whole files get replaced, not
patched — so keep each file independently coherent and never leave a change split
across files in a way that breaks if only one is uploaded.

## The three files

| File | Role |
|---|---|
| `index.html` | Every page of the site, as hidden `<main class="page-view">` blocks |
| `style.css` | The whole visual system — no framework |
| `app.js` | Routing, the sizing calculator, news, and the Supabase-backed client hub |

Also present: `brochure.html` (self-contained printable A4 technical guide, its own
inline CSS, no shared code with the above), `Matrix-Technical-Brochure.pdf`, and the
product/team photos.

### Architecture in one paragraph

A hand-written SPA with no framework. `index.html` holds 14 `<main id="view-*">` blocks;
`style.css:82` hides them all with `.page-view { display: none }` and `.active-view`
reveals one. `navigateTo(id)` in `app.js` swaps that class, updates the nav highlight
and pushes a `#hash`. HTML calls JS through inline `onclick`/`onsubmit` attributes; JS
reaches back with `getElementById`. The only contract between the files is agreed-upon
`id`s and class names.

## Conventions that will bite you

**Inline handlers need a global.** Any function called from an `onclick=` or `onsubmit=`
in the HTML — or from a template string that `app.js` itself injects — must be exposed
on `window`. There is an explicit `Object.assign(window, {...})` at the end of `app.js`;
add new handlers there. `removeQueuedItem` and `setAccountStatus` are called only from
generated markup, which is easy to miss when tidying that list.

**Adding a page** means three edits: a `<main id="view-NAME" class="page-view">` block,
a nav button with `id="nav-NAME"`, and any `navigateTo('NAME')` callers. An unknown id
silently falls back to the home view rather than erroring.

**Escape everything from the database.** `esc()` in `app.js` is applied to every
interpolated value, and there are now no exceptions. `loadLiveNews()` used to inject
`post.content` as raw HTML; it no longer does — the PDF button is rebuilt from a URL
by `pdfLinkFor()`, which accepts `https:` only. Do not reintroduce raw rendering of a
database column, and do not remove `esc()` from anything to match some older pattern.

**`style.css` is two eras in one cascade.** The original stylesheet runs to about line
286; from the `ADDITIONS` marker onward is a later block that redefines many of the same
selectors (`.btn-solid-navy`, `.brochure-panel`, `.admin-panel`, and ~30 more). Later
rules win. When changing a component, grep for *all* occurrences of the selector and
edit the last one, or you will change nothing.

## The client hub — rules 1 and 2, do not undo this

The portal was rewritten specifically to remove browser-side authentication. The
previous version read a `portal_users` table with the anon key and compared PINs in
JavaScript, which meant every customer's email, PIN, orders and prices were readable
from the dev console, and the staff admin passcode was a literal in `app.js`. The header
comment in `app.js` documents this.

Who is who, and where that is decided:

- **Staff** are `@creasingmatrix.com` accounts. **Customers** are Supabase Auth accounts
  linked to a company in `portal_users`, and see only that company's orders.
- Both of those are resolved **in the database**. `app.js` contains no email-domain
  check and never queries `portal_users` directly — it calls `portal_whoami`, which
  returns staff status and company, and the page only picks which panel to show. Do not
  add a domain check or a `portal_users` read to the client; that would be rule 1 all
  over again, just with a different string comparison.

Rules that follow:

- The browser decides nothing about access.
- **The orders query sends no customer filter.** `fetchMyOrders()` selects from `orders`
  with no `.eq()` on company — row-level security in Postgres scopes the rows. Adding a
  client-side filter would imply the boundary lives here. It does not.
- Writes go through RPCs (`portal_place_order`, `portal_link_account`,
  `portal_set_status`, `portal_list_accounts`), each of which re-checks authorisation
  inside the database.
- `SUPABASE_ANON_KEY` in `app.js` is a publishable key and is meant to be in the repo.
  It grants nothing on its own. Do not "fix" it by moving it out, and do not add a
  service-role key to this file under any circumstances.
- There is no separate admin password. Staff sign in on the same form with their own
  account.
- Login errors are deliberately vague ("Those details were not recognised") so they
  don't confirm whether an account exists. Keep them that way.

## Database security — how the policies actually work

Access lives in Postgres. Two helpers do the deciding, and both are called
*from inside policies*:

- `is_staff()` — true when the signed-in account's email ends `@creasingmatrix.com`.
- `my_company()` — the signed-in customer's company from `portal_users`.

**`authenticated` must keep `EXECUTE` on both.** Revoking it does not tighten
anything; it breaks every policy that calls them and locks out staff and
customers alike. That has already happened once. If you are tempted to revoke a
grant, this is the one to leave alone.

Things that were fixed and must not be undone:

- **RLS is enabled on every table.** `orders`, `line_items` and `portal_users`
  previously had policies written but RLS switched *off*, which meant the
  publishable key had full read/write over every customer's orders. Policies
  with RLS disabled are decoration.
- **Fourteen factory tables moved from "any authenticated user" to `is_staff()`.**
  Customers can sign in now, so `authenticated` no longer implies staff. Before
  that, a customer login could read all the bonding runs and the tooling.
- **The `news-pdfs` bucket is staff-only for write, public for read** —
  `news_staff_upload` / `news_staff_update` / `news_staff_delete` all check
  `bucket_id = 'news-pdfs' AND is_staff()`; `news_public_read` allows anon
  reads. It previously allowed uploads from `public`, meaning anonymous.

When you add a policy, remember PostgreSQL ORs permissive policies together: a
new strict policy does **not** override an old loose one sitting beside it. The
old one has to be dropped. Check `pg_policies` for leftovers rather than
assuming a table is locked down because a strict policy exists on it.

Test customer: `test@barplate-demo.com`, linked to Bar-Plate Manufacturing.

## News publishing — rules 1 and 2 again

Staff publish from the admin screen; there is no passcode anywhere in the
browser, and there must never be one.

- The **headline is the PDF's file name with the extension removed** — never
  typed. `newsTitleFromFileName()` strips only the extension, so spacing and
  capitalisation survive as the file was named. The read-only Headline box
  shows staff exactly what will be published before they commit.
- The PDF is required; the cover photo is optional.
- Both files go to the `news-pdfs` bucket, then `portal_publish_news(p_title,
  p_pdf_url, p_image_url)` writes the row. It is `SECURITY DEFINER` and
  re-checks `is_staff()` inside the database, so it works regardless of the
  table's own INSERT policy — and refuses everyone else.
- `news_posts.pdf_url` holds the link. The four original posts stored a whole
  `<a>` tag inside `content` instead, which is why the site used to render that
  column as raw HTML. `pdfLinkFor()` now reads `pdf_url`, falls back to lifting
  the `href` out of legacy `content`, and accepts `https:` only — so nothing
  from the database is injected as markup any more. Do not reintroduce raw
  `content` rendering.

## Product data — rules 3 and 4

`window.MATRIX_CATALOGUE` is inlined in `index.html` before `app.js` loads. It is
**generated from the factory system's own product list** — around 240 sizes across the
four ranges — and must not be hand-edited or retyped. An earlier hand-maintained copy had
drifted badly (16 Phoenix XL sizes against 141, `Mauve 0.38 x 0.5mm` where the factory
system expects `Mauve 0.50mm`), and orders raised from it arrived as line items the
factory system could not match to stock.

`buildLineDescription()` assembles order lines in the exact string shape that system
parses, e.g. `Phoenix+ 0.50 x 1.30mm 2-3pt (24m) REEL`. Changing that format breaks
order intake at the other end — treat it as a wire protocol, not a display string.

Note the split: the *ordering* dropdowns come from `MATRIX_CATALOGUE`, while the
*published* colour-coded size charts on the product detail pages are static tables
hand-written in `index.html`. They are separate sources and can drift; if you change one
because the range changed, check the other.

## Content and copy

House style is plain, concrete and unshowy — trade language aimed at people who run
presses ("the crease you specify is the crease you get, box after box"). British
spelling throughout. Avoid marketing superlatives; the existing copy deliberately has
none. Real company details appear in the footer (address, company number 123380C,
established July 2009) — don't invent or alter them.

Product and team images are referenced by absolute
`raw.githubusercontent.com/chitchen25-del/Matrix-redesign-preview/main/IMG_*.png` URLs,
not relative paths. Renaming or removing an image file breaks the live site even though
the file sits right here in the repo.

## Accessibility

The additions block exists partly to fix what the original lacked: `:focus-visible`
outlines, a skip link, `prefers-reduced-motion` handling, `aria-expanded` on the mobile
menu toggle, `role="alert"` on form error lines, `aria-label`s on the SVG logo and
profile diagrams. Preserve these when editing the markup around them.
