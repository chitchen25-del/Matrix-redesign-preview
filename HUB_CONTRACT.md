# The client hub contract

**Between:** creasingmatrix.com (the website) and Matrix Sync (the production system)
**Written:** 12 September 2026, from the live Supabase schema
**Keep a copy in both projects.** When either side changes something in here, it
changes in both copies or it hasn't changed.

---

## Why this exists

The website and the production system are built separately and share one
database. Everything on the site is brochure except the client hub, and the hub
is not a contact form — an order placed there lands on the same production
system the shop floor works from, under the same work order number, and the
floor will make what it says.

So there is exactly one seam, and this is it.

---

## 1. Who someone is

Two functions in the database decide everything. Neither is enforced in the
browser.

**`is_staff()`** — true when the signed-in user's confirmed email is one of
exactly three: `chris@`, `dave@` or `steve@creasingmatrix.com`. Hard-coded in
the function. Adding a fourth member of staff is a database change, not a
settings change.

**`my_company()`** — reads `portal_users.company_name` for the signed-in
`auth.uid()`, **only where `status = 'Active'`**. Returns null otherwise.

`portal_users` is `(id, company_name, contact_email, access_pin, status,
created_at, user_id)`. A customer account is live only when it has both a
`user_id` linked to a real auth user **and** `status = 'Active'`.

> **The join key is the company name, spelled exactly.** `my_company()` returns
> text, and every customer policy compares it with `orders.customer` as text.
> "ProPack" and "ProPack " are different companies as far as the database is
> concerned. The site already warns staff about this on the invite screen; it is
> the single most likely cause of a customer seeing an empty hub.

---

## 2. What the site may touch

Row-level security is on for every table below. This is what the policies
actually say today, not what they ought to say.

| Table | A signed-in customer | Staff |
|---|---|---|
| `orders` | read own (`customer = my_company()`), insert own **only with `stage = 'Received'`** | everything |
| `line_items` | read and insert, via the parent order's customer | everything |
| `news_posts` | **public read**, including logged out | write |
| `portal_users` | read own row only | everything |
| `products`, `product_forms`, `product_aliases` | **nothing — staff only** | everything |
| `cases`, `movements`, `bonding_runs` | **nothing — staff only** | everything |
| `reservations` | nothing — staff only *(closed 12 Sep 2026)* | everything |

Note what customers deliberately **cannot** do: no UPDATE and no DELETE on
orders or line items. Once an order is placed it belongs to the factory. A
change of mind is a phone call, which is how it worked before the hub and how
it should keep working.

---

## 3. What an order must contain to land cleanly

The site inserts one `orders` row and one `line_items` row per product.

**On `orders`:**

- `id` — the work order number. **See §6: nothing allocates this today.**
- `customer` — must equal `my_company()` exactly, or the insert is refused
- `stage` — must be `'Received'`, or the insert is refused
- `order_date`, `due_date` — the date placed, and what the customer asked for
- `reference` — the customer's own PO or reference
- `address` — only when it differs from their usual delivery address
- `box_type` — **which carton the order packs into.** One of: PX Plus, Ultra SR,
  White, Viking, JKK, Smart Formes. This is not cosmetic: the pick gate refuses
  shelf stock whose carton does not match the order's, so an order that arrives
  without one is harder to fill.
- `notes` — the "anything we should know" field

**On each `line_items` row:**

- `order_id`, `qty`, `description`
- `customer_ref` — their own line reference, if they gave one
- `unit_price` — the site should not set this. Pricing is the factory's.

**The `description` is the important one.** It is the product name in full, and
the production system matches on it — exactly first, then dimensionally. The
form it must take:

```
PX Plus 0.50 x 1.50mm 2-3pt (24m)
<family> <thickness> x <channel>mm <rule> (<metres>m)
```

Get this wrong and the order still lands, but the planner will not connect it to
the sizes the factory extrudes, and it will sit looking like demand for
something nobody makes.

Four descriptions are treated as **not product** and excluded from every count
on the production side: anything matching `delivery`, `carriage`,
`profile tape`, or `shim`. Put carriage on an order however you like; it will
not be counted as boxes.

---

## 4. What the site may show a customer about progress

Only `orders.stage`, which is one of **Received · Manufacturing · Packing ·
Shipped**, plus `shipped_date`. That is exactly what the site promises, and it
is all a customer can read — cases, movements and bonding runs are staff-only,
so the hub cannot show box codes, bay locations or which pallet something is on.

That is the right boundary. Do not widen it to make a progress bar prettier.

---

## 5. The product list

The site says it orders "from the real size list … pulled from the factory's own
product list". The tables behind that are:

- `products` — `(family, colour, thickness, gos, pt, variant, display_name,
  active, needs_review)`, 256 rows
- `product_forms` — `(product_id, form, metres, active)`, 257 rows. `form` is Box
  or Reel; `metres` is what a box of that size holds
- `product_aliases` — 289 rows of names the same product has been ordered under

**A customer cannot read any of them.** Both are staff-only. See §6.

---

## 6. Open questions — these need answering before the hub takes a real order

**a. Nothing allocates the work order number — CLOSED 12 Sep 2026.** See §8:
`place_portal_order` allocates it under an advisory lock.

**b. A hub order arrives with no case plan.** There is no trigger that creates
`cases` rows, and the production system gets its need from the case plan, not
from the line items — so an order placed on the site promises nothing until
someone in the app lays its cases down. Until that is settled, every hub order
needs a manual step on the floor side. Decide whether the app does it when the
order first appears, or a trigger does it on insert.

**c. The min-version trigger will refuse the website's orders — CLOSED
12 Sep 2026.** `enforce_min_app_version` exempts `/rpc/*`, and §8 is an RPC. The
website never needs a build number and never breaks when the floor app's
minimum is raised.

**d. Customers cannot read the product list — CLOSED 12 Sep 2026.** See §9:
the `portal_size_list` view. `products` and `product_forms` stay staff-only.

**e. `reservations` was open to every signed-in user — CLOSED 12 Sep 2026.**
The policy was `ALL … USING (true) WITH CHECK (true)`, so any customer with a
hub login could read all 259 promise rows — box codes, quantities and other
customers' work order numbers — and write to them. It is now
`is_staff()` for both USING and WITH CHECK, matching `cases`, `movements` and
`bonding_runs`. Left here rather than deleted, because a policy that was wrong
once is worth checking after any migration that touches the table.

---

## 8. Placing an order: `place_portal_order`

**The website does not INSERT any more. It calls this.**

```js
const { data: workOrderNumber, error } = await supabase.rpc('place_portal_order', {
  p_reference: 'PO-5567',            // their own PO number, optional
  p_due_date:  '2026-11-01',         // optional
  p_box_type:  'PX Plus',            // optional, one of the six carton types
  p_notes:     'leave at goods in',  // optional
  p_address:   null,                 // only when it differs from their usual
  p_lines: [
    { description: 'PX Plus 0.30 x 1.00mm 2-3pt (24m)', qty: 40, customerRef: 'their line 1' },
    { description: 'PX Plus 0.30 x 1.10mm 2-3pt (24m)', qty: 20 },
  ],
});
// data === 'WO-0034'
```

It returns the work order number as text. Show it to the customer — it is the
number Matrix uses internally and the one they should quote.

**What it guarantees, so the site does not have to:**

- the number is allocated here, under an advisory lock, so two customers
  pressing send in the same second cannot collide
- `customer` comes from `my_company()` and nothing else — a customer cannot
  place an order for another company whatever they send
- `source = 'portal'`, `stage = 'Received'`, `confirmed_at` null. Always.
- **any `unitPrice` sent is ignored.** Every line is stored at 0 until Steve
  prices it. A customer does not set what they pay.
- every line is checked against the live catalogue BEFORE anything is written,
  so a bad line cannot leave half an order on the system

**The errors it raises, all of them safe to show the customer as they are:**

| When | Message |
|---|---|
| no active hub account | No hub account is linked to this login, or it is not active yet. |
| no lines | An order needs at least one line. |
| a line with no product | A line has no product on it. |
| qty zero, negative or fractional | Line "…" has a quantity of 0 — it must be a whole number above nothing. |
| product not on the size list | We do not have "…" on our size list. Please pick from the list. |

Proved end to end on 12 Sep against the live database, inside a transaction
that was deliberately rolled back so no real work order number was used up.

**Still to do on the floor side:** a confirmed hub order needs its cases laid
down, which `2026-09-12.1` does on one press from the Matrix overview, and
`2026-09-12.2` does automatically when Steve confirms and prices it in the
Client orders queue.

---

## 9. The size list: `portal_size_list`

`products` and `product_forms` remain staff-only. This view is the
customer-facing slice of them — active, undeleted, and nothing else. No
`needs_review`, no rows that are not for sale.

```js
const { data } = await supabase
  .from('portal_size_list')
  .select('description, family, form, metres, thickness, gos, pt')
  .order('family').order('description');
```

**Send `description` straight back to `place_portal_order`.** The view builds
that string, and it is the same string the production system matches an order
line on:

    Box:  PX Plus 0.30 x 1.00mm 2-3pt (24m)
    Reel: PX Plus 0.70 x 2.30mm 2-3pt (36m) REEL

If the website assembled it instead, the two would drift the first time a
naming rule changed, and the symptom would be an order that lands looking like
demand for something nobody makes.

Readable by `authenticated` only, not `anon` — the hub is invitation only, and
the public size tables on the site are already published separately.

**253 rows today**, across PX Plus (124), Smart Formes (124), Ken PX (5),
Exceed, and three Speedy Crease lines.

### Two naming things the website has to reconcile

**The site sells names the catalogue does not use.** The public pages offer
**Phoenix+**, **Phoenix XL**, **Ultra-SR** and **Exceed Rubber**. The catalogue
calls them **PX Plus**, **Ultra SR** and **Exceed**, and has no Phoenix XL at
all. The hub's ordering form must map its range names onto `family` values from
this view, or a customer will pick a range and find it empty.

**Ultra SR cannot be ordered at all right now.** All 19 Ultra SR products are
active, but not one of them has a `product_forms` row — so there is no box or
reel to order, no metreage, and they do not appear in this view. Same for the
three Profile Tape products, three PX Plus, three Smart Formes and one Exceed.
That is a catalogue job on the Matrix side, not a website one: **26 active
products with no form**.

---

## 10. Talking about an order: `order_messages`

**One table, two front doors.** The website writes as the customer; Matrix Sync
writes as Matrix. Neither project owns it.

```js
// read the thread on an order
const { data } = await supabase
  .from('order_messages')
  .select('id, body, author_side, author_name, created_at, read_at')
  .eq('order_id', workOrderNumber)
  .eq('deleted', false)
  .order('created_at');

// post as the customer
await supabase.from('order_messages').insert({
  id: 'msg-' + crypto.randomUUID(),
  order_id: workOrderNumber,
  body: text,
  author_side: 'customer',
  author_name: contactName,   // optional, for "Jane at Print Works"
});
```

**What the policies enforce, so the site does not have to:**

- a customer reads and writes only on **their own** orders
- a customer may only ever post with `author_side = 'customer'` — they cannot
  post as Matrix
- a customer cannot set `read_at`. That column is the OTHER side saying it has
  seen the message, and it is what drives the unread count on both screens.
- `author_side` is stored, not derived, so a message still reads correctly
  after somebody leaves and their login is gone

### Read receipts: `mark_messages_read(p_order_id)`

There is deliberately **no customer UPDATE policy** on this table. Marking
Matrix's messages read goes through an RPC instead:

```js
const { data: marked } = await supabase.rpc('mark_messages_read', {
  p_order_id: workOrderNumber,
});
// returns how many were marked
```

It stamps `read_at = now()` on Matrix's unread messages **on that customer's
own order**, and touches nothing else. Website Claude found the gap — the
update in the first draft of the brief matched zero rows, silently, so "seen"
would never have lit up against Dave's replies — and proposed either a policy
or this. The RPC won for the reason they gave: a row policy constrains which
ROWS, not which columns, so it would also have let a customer rewrite the body
of a message Matrix sent.

Proved 12 Sep against the live database as a customer: 1 marked on their own
order, 0 on another company's, the message body untouched, and their own
message left unread.

### Withdrawn messages — `withdrawn_at`

Matrix can withdraw **its own** message. Customer messages are never withdrawn
and never deleted: that is the record of what they asked for.

A withdrawn message still comes back in the thread. **Show it as withdrawn, do
not hide it** — the customer has already read it, and a gap where it was leaves
them wondering whether they imagined it. Matrix Sync shows the text struck
through with "withdrawn" and the time.

```js
// in the thread render
if (m.withdrawn_at) { /* struck through, "Matrix withdrew this" */ }
```

Nothing on the website writes this column.

**Unread, for a badge:** count messages on the customer's orders where
`author_side = 'matrix'` and `read_at is null`. Matrix counts the mirror image.

**What it is for, and what it is not.** Anything about a particular order: a
price query, "can you split the delivery", "these are three days late". It is
not a chat channel and it is not a support desk — a message with no order to
hang on cannot exist, because `order_id` is required and references a real
order.

---

## 11. Who is who: one role store

There is **one** role store and one function that answers the question. Both
projects ask it; neither keeps its own copy.

| Function | True for | What it opens |
|---|---|---|
| `is_staff()` | admin — Chris, Dave, Steve | everything, factory included |
| `is_sales()` | admin **or** sales — Mark | orders, line items, order messages, portal accounts; the catalogue read-only |
| `my_company()` | a customer with an active hub account | their own orders and messages only |
| `staff_role()` | — | returns `'admin'`, `'sales'` or null. What a front end should ask on sign-in. |

**The sales role lives in `portal.staff_roles`**, keyed on `auth.uid()`, and the
website grants it with `portal_grant_sales()`. That is the only place it is
written. `public.staff_users` holds the **admin list and nothing else**, and
carries a comment saying so.

This was nearly two role systems: Matrix Sync built `staff_users` with its own
sales role without checking, the website already had `portal.staff_roles`, and
website Claude caught it. Same failure as two product lists — whichever is
edited last silently wins. One store, one function.

**What the factory tables say, unchanged:** `bonding_runs`, `cases`,
`movements`, `reservations`, `glue_line_batches`, extrusion and tooling are all
`is_staff()`. A sales login is refused by the database, not merely hidden from
by a front end. Matrix Sync also cuts its own navigation down to what a sales
user can use, so the app does not offer screens that would only ever come back
empty — but that is manners, not security.

---

## 12. The acknowledgement: `order_acknowledgements`

Stored when Steve confirms and prices an order, so the customer can download
**the document he actually confirmed** rather than a second render of it.

```js
const { data } = await supabase
  .from('order_acknowledgements')
  .select('id, html, total, currency, created_at')
  .eq('order_id', workOrderNumber)
  .eq('deleted', false)
  .order('created_at', { ascending: false })
  .limit(1);
// data[0].html is a complete standalone document — render in an iframe,
// or offer as a download / print.
//
// It carries its own viewport and scales to fit below 760px, so an iframe at
// the container's width shows the whole page rather than a clipped one. It
// prints at A4 unchanged — a document a customer might hold against an invoice
// should not change shape depending on what opened it.
```

Customers may **read their own and nothing else** — no insert, no update. They
cannot alter the copy they were sent, which is rather the point of keeping it.

**It is not an invoice.** It carries the work order number, never an invoice
number, and nothing is payable against it — the document says so in words.
Xero still issues the invoice on despatch. Do not label the link "invoice".

If a price changes afterwards a new row is written; take the newest by
`created_at`. The older ones are the record of what was agreed before.

### Telling Matrix it was opened: `mark_acknowledgement_opened(p_order_id)`

**Call this when the customer actually opens the document** — not when the
order page loads.

```js
await supabase.rpc('mark_acknowledgement_opened', { p_order_id: workOrderNumber });
```

It stamps `opened_at` on their own order's acknowledgement, first opening only,
and touches nothing else. As with read receipts there is no customer UPDATE
policy, for the same reason: a row policy would also let them rewrite the
document they were sent.

**Why it matters on our side.** Matrix is deliberately NOT emailing the
acknowledgement — it lives in the customer's account, so the only thing an
email would add is the nudge. Instead the Matrix overview shows which
acknowledgements have not been opened and how long they have sat, so Dave rings
the customer who has not looked. If this is never called, everything still
works, but Dave will chase people who have already read it.

Proved 12 Sep as a customer: 1 marked on their own order, 0 on a second
attempt, 0 on another company's, document untouched.

---

## 7. Rules that hold on both sides

1. **The floor's data is the truth.** The website shows it; it does not decide
   it. If the two disagree, the production system wins.
2. **Access is enforced in the database**, never in the browser. Any new hub
   feature is a policy question first and a UI question second.
3. **A customer never sees another customer's anything.** If a change makes that
   possible even in principle, it does not ship.
4. **The description format in §3 is the shared vocabulary.** Neither side
   changes it alone.
5. **Nothing the customer sends sets a price, a stage beyond Received, a
   priority, or a due date the factory has agreed to.** Those are the factory's
   to set.
