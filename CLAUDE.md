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
4. **The website does not build product descriptions any more, and does not keep
   its own catalogue.** Both come from `portal_size_list`, and the `description`
   string goes back to `place_portal_order` byte for byte. `buildLineDescription()`
   and the hard-coded `MATRIX_CATALOGUE` are gone. If you find yourself about to
   assemble a product name in the browser, that is the bug.
5. **This repository is the website only. Matrix Sync is a separate repository
   and the database is shared, not owned.** Do not change schema, policies,
   functions or data to make something here easier. The factory runs on that
   database; the website is a guest on it. If a change here appears to need a
   database change, that is a conversation with production, not a migration.

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
inline CSS, no shared code with the above), `MatrixTechnicalBrochure.pdf`, the
product/team photos, and `favicon.svg` / `apple-touch-icon.png` / `og-image.png`.
The share image and icons are generated assets — regenerate them rather than
hand-editing, and keep `og-image.png` at 1200x630 or link previews crop badly.

### Architecture in one paragraph

A hand-written SPA with no framework. `index.html` holds 12 `<main id="view-*">` blocks;
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

- **Staff** are the addresses in `is_staff()`. **Customers** are Supabase Auth accounts
  linked to a company in `portal_users`, and see only that company's orders.
- **There is no public sign-up, by design.** `signUp` is never called from `app.js`.
  An account exists because someone at Matrix invited that address; the hub is
  something salespeople hand to a client once their account is open, not
  something a visitor can let themselves into. Do not add a registration form.
- Invitations are currently sent from the Supabase dashboard (Authentication →
  Users → Invite user), then linked to a company in the staff admin panel.
  Issuing them from the admin panel instead would need an Edge Function holding
  the service-role key server-side — the invite API must never be called from
  the browser. That is production work and has not been done.
- An invitation or reset link returns the client to this site with a token in
  the URL fragment — the same place the router keeps `#products`. `app.js`
  captures it into `ARRIVED_FROM_EMAIL` at the top of the file, before
  `navigateTo()` rewrites the fragment on first render. Move that capture later
  and invited clients land silently on the home page instead of the
  set-password screen.
- The Supabase redirect allow-list has to contain the site URL or invitation
  links will not come back here.
- Both determinations are resolved **in the database**. `app.js` contains no
  email-domain check and never queries `portal_users` directly — it calls
  `portal_whoami`, which returns staff status and company, and the page only
  picks which panel to show. Do not add a domain check or a `portal_users` read
  to the client; that would be rule 1 all over again, just with a different
  string comparison.

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

## The contract with the production system — rule 5

Two repositories, one database. This one is the public website and the client
hub; **Matrix Sync**, the production control PWA the shop floor runs on, is the
other. Neither is deployed with the other, so anything they share has to hold
across two independent releases.

The surface is small. These are the only places they touch:

| Touchpoint | Direction | Owned by |
|---|---|---|
| `orders`, `line_items` | website writes via `place_portal_order`, reads via RLS | production |
| `portal_size_list` | website reads; the only catalogue the site has | production |
| `orders.stage` | website reads and displays | production |
| The `WO-nnnn` sequence | website continues it | production |
| The line description string | website writes, production parses | shared |

Everything else in this repo — news, `portal_users`, the catalogue, the whole
public site — is either website-only or read-only. A change that seems to need
anything outside that table is almost certainly in the wrong repository.

**The website writes only through RPCs, never to a table directly.** This is not
just tidiness. The production side guards its own tables with triggers, and
`enforce_min_app_version()` rejects any write that does not carry an
`x-app-version` header — it exempts `/rpc/` paths explicitly. The website does
not send that header and should not start. So a direct `.insert()` from here,
however reasonable it looks, gets rejected by a guard built for Matrix Sync.
`place_portal_order` is the only way an order may be created from this side. It
allocates the work order number under an advisory lock, takes the customer from
the login rather than the page, forces `stage` and `source`, ignores any price
sent, and validates every line against the live catalogue before writing
anything. Its error messages are written for customers and are shown to them
word for word — do not replace them with a generic failure.

Note the rename: it was `portal_place_order` and is now `place_portal_order`,
with a new `p_box_type` argument. The old name no longer exists.
Reads are different: `fetchMyOrders()` selects from `orders` directly, which is
fine because RLS scopes it and triggers do not run on SELECT.

**`orders.stage` is a shared vocabulary with nothing enforcing it.** There is no
check constraint on the column — it is free text, and production can write
anything. The four names the customer tracker knows are `Received`,
`Manufacturing`, `Packing`, `Shipped`. In use at the time of writing: the first,
second and fourth; nothing writes `Packing` yet.

This used to fail silently and badly. `renderOrderCard()` matched on the first
four characters and clamped a miss to index 0, so any stage production renamed
showed the customer *Received* — indefinitely, while their order was being
packed. Matching is now on the whole name, and an unrecognised stage is
displayed exactly as recorded with no step marked. Do not "fix" that fallback by
guessing a nearest step, and do not add a name to `STAGE_STEPS` without checking
with production what it means. Mapping a stage wrongly tells a customer their
order shipped when it has not, which is worse than admitting we do not know.

If production renames a stage, that is a coordinated change: the name has to be
added here before or with the rename, not after.

**The WO sequence is read-then-insert with no lock.** `portal_place_order` takes
`MAX(WO-nnnn) + 1`. A portal order landing in the same instant as one raised
in-house can collide. It is rare and it fails loudly rather than corrupting
anything, but it is a known sharp edge rather than a solved problem.

## Database security — how the policies actually work

Access lives in Postgres. Two helpers do the deciding, and both are called
*from inside policies*:

- `is_staff()` — **an explicit allow-list of individual addresses**, not a domain
  check. At the time of writing: `chris@`, `dave@` and `steve@creasingmatrix.com`,
  and only with a confirmed email. A new Matrix starter is *not* staff simply by
  having a company address — someone has to add them to the function, and until
  that happens they sign in successfully and then see an empty hub with no
  explanation. Worth knowing before debugging it from this side; changing it is
  a production change, not a website one.
- `my_company()` — the signed-in customer's company from `portal_users`,
  and only where their row is `Active`.

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
drifted badly (16 Phoenix+ sizes against 141, `Mauve 0.38 x 0.5mm` where the factory
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

## Known problems that are not ours to fix

Found while reading the shared database from this side. All of them live in the
production project, so they are recorded here rather than acted on.

- **`portal_list_accounts()` cannot succeed.** It declares `RETURNS TABLE(id
  bigint, ...)` and selects `portal_users.id`, which is a `uuid`. The staff
  "Who has access" table and the Revoke/Restore buttons therefore do not work.
  `portal_set_status(p_id bigint)` has the same mismatch, and `app.js`
  interpolates the id unquoted into an `onclick`, which a uuid would break
  anyway. Linking an account is unaffected. Fixing it means dropping and
  recreating both functions — a return type cannot be changed in place.
- **Snapshot and backup tables are readable with the publishable key.** A number
  of `pretest_*`, `*_backup_*` and `*_archive_*` tables have RLS off and `SELECT`
  granted to `anon`, and some hold customer names, order references, notes and
  unit prices. This is the leak rule 1 describes, surviving in copies of the
  tables it was fixed on. Several look like regression fixtures, so enabling RLS
  may affect the production test run — which is exactly why it is a production
  decision.
- **`check_shared_secret()` contains a literal secret** and is referenced by no
  policy. Dead code, but it should not be sitting in the schema.
- `portal_users.access_pin` is a leftover from the browser-side PIN check and is
  written as `'n/a'`. Nothing reads it.


## Naming mismatches between the site and the catalogue

The public pages and the factory catalogue do not use the same range names, and
the ordering form reconciles them through `RANGE_LABELS` in `app.js`:

| Site sells | Catalogue calls it |
|---|---|
| Phoenix+ | `PX Plus` |
| Ultra-SR | `Ultra SR` |
| Exceed Rubber | `Exceed` |
| **Phoenix XL** | **nothing — it is not in the catalogue at all** |

The order form lists whatever families `portal_size_list` returns, labelled with
both names where they differ, so a customer sees the range they recognise and
the name that will appear on their work order.

Two consequences worth holding on to:

- **Phoenix XL has a full product page and 55 sizes on this site, and does not
  exist in the factory catalogue.** Nobody can order it through the hub. Either
  the catalogue is missing it or the site is selling something we do not make,
  and that is a question for Matrix rather than a thing to code around.
- **Ultra-SR cannot be ordered either**, for a different reason: all 19 products
  are active but none has a `product_forms` row, so there is no box or reel and
  they never reach the view. Matrix are fixing the catalogue. When they do, the
  range appears in the form on its own with no website change — which is the
  point of reading the list rather than keeping one.

## Prices in the hub

A hub order lands with every `unit_price` at 0 and unconfirmed, until Steve
prices it in the production app. **The order screens must never show a price**,
because 0 is not a price and a customer reading one would be misled. They show
description and quantity only, which is deliberate.

If an order acknowledgement is ever surfaced here, it carries the work order
number and nothing is payable against it. It must not be called an invoice —
Xero issues those on despatch.

## Open, on the public pages

**The Phoenix+ 7mm off-centre chart lists Orange at 0.60 mm.** Every other chart
on the site has Orange at 0.70 mm — 7mm mini centre, 10mm standard, 12mm. Since
the charts are colour-coded by height, one colour at two heights is something a
customer orders wrong from.

The database cannot settle it: `products` records colours only for Ultra SR and
Profile Tape, and holds none at all for PX Plus. So this needs the paper charts,
and it has deliberately been left as-is rather than guessed at — changing a
published technical figure on a hunch is worse than flagging it.
