/* =========================================================================
   Matrix Engineering — public site

   WHAT CHANGED, AND WHY

   The previous version authenticated customers in the browser: it read the
   portal_users table with the public anon key, compared the typed PIN against
   the row it got back, and let you in. That can't work. The table had to be
   readable for the check to run, so every client's company name, email and
   PIN were available to anyone who opened the developer console — as were
   every customer's orders and prices. The staff admin passcode was a string
   in this file.

   So the browser no longer decides anything. Customers sign in with a real
   Supabase Auth account and the database itself scopes what they can see,
   via row-level security keyed on the signed-in user. If someone edits this
   file, changes a variable, or calls the API directly, they still only get
   their own company's rows — because the rule lives in Postgres, not here.

   The staff admin console and the news publisher are staff-only screens,
   reached by signing in with a Matrix account on the same form as everyone
   else. The database reports who is staff and re-checks every action they
   take. What was wrong before was the JavaScript passcode in front of them,
   not the screens themselves.
   ========================================================================= */

const SUPABASE_URL = 'https://bjoneyilyyvoemeiojzl.supabase.co';
// Publishable key. Safe to ship precisely because RLS enforces access —
// this key grants nothing on its own.
const SUPABASE_ANON_KEY = 'sb_publishable_ZVnaPefnAgf4KfrBFkCmzw_3GfhiAnY';
const sb = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let session = null;         // the signed-in Supabase user, or null
let myCompany = '';         // resolved from the database, never from the page
let queuedLineItems = [];

// Read before anything else runs. navigateTo() rewrites the fragment on the
// first render, so an invitation or reset token has to be captured here or it
// is gone by the time the boot handler looks for it.
const ARRIVED_FROM_EMAIL = authTokenInUrl();

/* ---------------------------------------------------------------------
   PRODUCT CATALOGUE
   Generated from the production system's own product list rather than
   retyped here. The previous version carried its own copy, and the two had
   already drifted: 16 PX Plus sizes against 141, Ultra SR written
   "Mauve 0.38 x 0.5mm" where the factory system expects "Mauve 0.50mm",
   and pt values as "2 / 3 pt" where it parses "2-3pt". Orders raised that
   way arrive as line items the factory system can't match to stock.
--------------------------------------------------------------------- */
const CATALOGUE = window.MATRIX_CATALOGUE || {};
const BOX_AMOUNTS = [15, 18, 19.5, 20.25, 21, 24, 36, 60];
const REEL_AMOUNTS = [30, 33, 36, 39, 45];

// Line descriptions are built in the exact shape the factory system parses,
// so a portal order behaves like one typed in-house.
function buildLineDescription({ range, size, pt, unit, metres }) {
  const bits = [range, size];
  if (pt) bits.push(pt);
  bits.push(`(${metres}m)`);
  if (unit === 'Reel') bits.push('REEL');
  return bits.join(' ');
}

/* ---------------------------------------------------------------------
   NAVIGATION
--------------------------------------------------------------------- */

/* Each view gets its own title and description. The site is one document with
   hash routing, so this does not create separate search results — a crawler
   sees the head as it was served. What it does do is make the browser tab,
   the back button, a bookmark and a shared #link say what the page actually
   is, instead of the site name twelve times over. */
const SITE_NAME = 'Matrix Engineering';
const PAGE_META = {
  home: ['Creasing Matrix & Ejection Rubber, Isle of Man',
    'Creasing matrix, ejection rubber and makeready tooling, extruded in our own facility on the Isle of Man and supplied to carton converters worldwide.'],
  about: ['About us',
    'Extruding creasing matrix on the Isle of Man since 2009, supplying folding carton converters and die-makers worldwide.'],
  products: ['Products',
    'Phoenix+, Phoenix XL, Ultra-SR creasing matrix and Exceed ejection rubber, with the full colour-coded sizing for each range.'],
  'phoenix-plus': ['Phoenix+ creasing matrix',
    'Our standard polymer-base creasing matrix, and the one most presses run. Full size range from 0.20 x 0.80mm upwards.'],
  'phoenix-xl': ['Phoenix XL creasing matrix',
    'A wider base for heavier board and longer runs, where a standard footprint moves under load.'],
  'ultra-sr': ['Ultra-SR creasing matrix',
    'Polyester-base matrix on 100 micron Mylar film, colour coded by thickness, for recycled and abrasive boards.'],
  'exceed-rubber': ['Exceed ejection rubber',
    'Micro-cellular ejection rubber in 7.00mm and 7.25mm profiles, supplied in 24m and 60m boxes.'],
  technical: ['Technical guidance',
    'Matrix sizing for board caliper and rule thickness, fitting guidance, and the full printable technical brochure.'],
  accessories: ['Accessories',
    'Shim, patching tape and makeready consumables for the die shop.'],
  news: ['Latest news',
    'Announcements and technical bulletins from Matrix Engineering.'],
  contact: ['Contact us',
    'Ballasalla, Isle of Man. Call +44 (0)1624 822960 or email sales@creasingmatrix.com for samples and enquiries.'],
  portal: ['Client hub',
    'Account holders can place orders and follow them through manufacture, packing and shipping.'],
};

function setMeta(name, attr, value) {
  const el = document.querySelector(`meta[${attr}="${name}"]`);
  if (el) el.setAttribute('content', value);
}

function applyPageMeta(pageId) {
  const meta = PAGE_META[pageId] || PAGE_META.home;
  const title = pageId === 'home'
    ? `${SITE_NAME} | ${meta[0]}`
    : `${meta[0]} | ${SITE_NAME}`;
  document.title = title;
  setMeta('description', 'name', meta[1]);
  setMeta('og:title', 'property', title);
  setMeta('og:description', 'property', meta[1]);
  setMeta('twitter:title', 'name', title);
  setMeta('twitter:description', 'name', meta[1]);

  const url = 'https://www.creasingmatrix.com/' + (pageId === 'home' ? '' : `#${pageId}`);
  const canon = document.querySelector('link[rel="canonical"]');
  if (canon) canon.setAttribute('href', url);
  setMeta('og:url', 'property', url);
}
const menuToggle = document.getElementById('menuToggle');
const siteNav = document.getElementById('siteNav');

menuToggle.addEventListener('click', () => {
  const open = menuToggle.classList.toggle('open');
  siteNav.classList.toggle('mobile-active');
  menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

function navigateTo(pageId) {
  menuToggle.classList.remove('open');
  siteNav.classList.remove('mobile-active');
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active-view'));
  const target = document.getElementById(`view-${pageId}`);
  // An unknown id falls back to home, so the metadata has to fall back with it
  // rather than describing a page that is not on screen.
  const shown = target ? pageId : 'home';
  (target || document.getElementById('view-home')).classList.add('active-view');
  applyPageMeta(shown);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`nav-${pageId}`);
  if (btn) btn.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.pushState(null, '', `#${pageId}`);
}
window.navigateTo = navigateTo;
window.addEventListener('popstate', () =>
  navigateTo(window.location.hash.replace('#', '') || 'home'));

/* ---------------------------------------------------------------------
   NEWS — public, read-only. Staff publish from the admin screen below.
--------------------------------------------------------------------- */
async function loadLiveNews() {
  const grid = document.getElementById('liveNewsGrid');
  if (!grid) return;
  if (!sb) { grid.innerHTML = emptyNews('News is unavailable right now.'); return; }
  try {
    const { data, error } = await sb.from('news_posts').select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || !data.length) { grid.innerHTML = emptyNews('No announcements yet.'); return; }
    grid.innerHTML = data.map(post => {
      const pdf = pdfLinkFor(post);
      return `
      <article class="news-card">
        <div class="news-card-img">
          <img src="${esc(post.image_url || '')}" alt="" loading="lazy">
          <span class="news-badge">${esc(post.category || 'Update')}</span>
        </div>
        <div class="news-card-content">
          <div>
            <div class="news-date">${esc(post.date_text || '')}</div>
            <h3>${esc(post.title || '')}</h3>
          </div>
          ${pdf ? `<a class="news-pdf-link" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer">Download the PDF</a>` : ''}
        </div>
      </article>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = emptyNews('News could not be loaded. Please try again shortly.');
  }
}
function emptyNews(msg) {
  return `<div class="empty-state"><p>${esc(msg)}</p></div>`;
}

/* The PDF button is built here from a URL, never taken from the database as
   markup. New posts carry pdf_url; the four original posts stored a whole <a>
   tag in `content`, so the href is lifted out of that and re-rendered. Only
   https links are accepted, so a stored javascript: URL cannot become a link. */
function pdfLinkFor(post) {
  if (post.pdf_url) return httpsOnly(post.pdf_url);
  const m = /href="([^"]+)"/i.exec(post.content || '');
  return m ? httpsOnly(m[1]) : '';
}
function httpsOnly(u) {
  return /^https:\/\//i.test(String(u ?? '')) ? String(u) : '';
}
// Anything coming back from the database is treated as text, not markup.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------------------------------------------------------------
   PORTAL — real authentication
--------------------------------------------------------------------- */
async function handlePortalLogin(e) {
  e.preventDefault();
  const email = document.getElementById('portalEmail').value.trim();
  const password = document.getElementById('portalPass').value;
  const btn = e.target.querySelector('button[type="submit"]');
  const err = document.getElementById('portalLoginError');
  err.textContent = '';

  if (!sb) { err.textContent = 'Cannot reach the server. Please try again shortly.'; return; }
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      // Deliberately vague: saying which half was wrong tells an attacker
      // whether an account exists.
      err.textContent = 'Those details were not recognised.';
      return;
    }
    session = data.session;
    await enterPortal();
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
}

let isStaff = false;

/* Exactly one of the four portal panels is ever on screen. Keeping that in
   one place stops the display flags drifting apart as panels get added. */
const PORTAL_PANELS = ['portalLoginGateway', 'portalSetPassword', 'portalPending',
                       'portalAdmin', 'portalDashboard'];
function showPortalPanel(id) {
  PORTAL_PANELS.forEach(p => {
    const el = document.getElementById(p);
    // Cleared rather than set to 'block' — the gateway is a grid, and an
    // inline display:block would flatten it into a single column.
    if (el) el.style.display = (p === id) ? '' : 'none';
  });
}

function switchAuthPane(pane) {
  const reset = pane === 'reset';
  document.getElementById('authPaneSignIn').style.display = reset ? 'none' : 'block';
  document.getElementById('authPaneReset').style.display = reset ? 'block' : 'none';
  document.getElementById('portalLoginError').textContent = '';
  const note = document.getElementById('resetNote');
  note.className = 'form-note'; note.textContent = '';
}

async function enterPortal() {
  // One call asks the database who this is. The page never decides — staff
  // status and company both come back from the signed-in account, so
  // editing anything in here changes nothing about what you can see.
  const { data: who, error } = await sb.rpc('portal_whoami');
  if (error) {
    document.getElementById('portalLoginError').textContent =
      'Could not verify your account. Please try again shortly.';
    await sb.auth.signOut(); session = null; return;
  }
  isStaff = !!(who && who.staff);

  if (isStaff) {
    showPortalPanel('portalAdmin');
    await loadAccounts();
    return;
  }

  // Signed in, but not yet linked to a company. This is the normal state for
  // anyone who has just created a login, so it gets a real panel explaining
  // what happens next rather than an error and a silent sign-out. They stay
  // signed in and still see nothing — my_company() returns no company, so
  // row-level security returns no rows.
  if (!who || !who.company) {
    const email = (session && session.user && session.user.email) || '';
    document.getElementById('pendingEmail').textContent = email;
    showPortalPanel('portalPending');
    return;
  }
  myCompany = who.company;
  document.getElementById('currentClientTitle').textContent = myCompany;
  document.getElementById('newOrderCustomer').value = myCompany;
  showPortalPanel('portalDashboard');
  maybeWelcome();

  const due = new Date();
  due.setDate(due.getDate() + 14);
  document.getElementById('newOrderDueDate').value = due.toISOString().split('T')[0];
  await fetchMyOrders();
}

/* ---------------------------------------------------------------------
   INVITATIONS — there is deliberately no public sign-up

   The hub is invitation only. Nobody can create their own login: an account
   exists because someone at Matrix invited that address, and it is linked to
   a company here before it shows anything. signUp is never called from this
   file, so there is no route in from the outside even for someone editing it.

   An invitation email lands the client back on this page carrying a token in
   the URL fragment. Supabase's client picks that up and establishes the
   session; all this code does is notice the arrival, put them on the portal
   page rather than the home view, and ask for a password. The same applies to
   a reset link, which is the only self-service action an existing account has.
--------------------------------------------------------------------- */

// The site uses the fragment for its own routing (#products, #portal), so an
// arriving token has to be told apart from a page name before navigateTo runs
// and falls back to home.
function authTokenInUrl() {
  const h = String(window.location.hash || '');
  if (!/access_token=|type=(invite|recovery|signup)|error_description=/.test(h)) return null;
  const p = new URLSearchParams(h.replace(/^#/, ''));
  return { type: p.get('type') || '', error: p.get('error_description') || '' };
}

function showSetPassword() {
  const email = (session && session.user && session.user.email) || '';
  document.getElementById('setPassEmail').textContent = email;
  showPortalPanel('portalSetPassword');
}

async function handleSetPassword(e) {
  e.preventDefault();
  const note = document.getElementById('setPassNote');
  const pass = document.getElementById('setPass').value;
  const pass2 = document.getElementById('setPass2').value;

  note.className = 'form-note'; note.textContent = '';
  if (!sb) { note.textContent = 'Cannot reach the server. Please try again shortly.'; return; }
  if (pass.length < 8) { note.textContent = 'Please use a password of at least 8 characters.'; return; }
  if (pass !== pass2) { note.textContent = 'Those two passwords do not match.'; return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) {
      // Usually an expired link, which is worth saying plainly — the fix is a
      // fresh invitation, not a different password.
      note.textContent = 'That did not save. Your invitation link may have expired — ' +
        'call us and we will send a new one.';
      return;
    }
    e.target.reset();
    const { data } = await sb.auth.getSession();
    session = (data && data.session) || session;
    await enterPortal();
  } finally {
    btn.disabled = false; btn.textContent = 'Set my password';
  }
}

/* The one thing an account holder can do unaided. The reply is the same
   whether or not the address has access, so this cannot be used to find out
   who our customers are. */
async function handlePasswordReset(e) {
  e.preventDefault();
  const note = document.getElementById('resetNote');
  const email = document.getElementById('resetEmail').value.trim();
  note.className = 'form-note'; note.textContent = '';
  if (!sb) { note.textContent = 'Cannot reach the server. Please try again shortly.'; return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
  } catch (err) {
    /* deliberately ignored — see the note below */
  } finally {
    btn.disabled = false; btn.textContent = 'Send the link';
    note.className = 'form-note ok';
    note.textContent = 'If that address has hub access, the link is on its way.';
    e.target.reset();
  }
}

/* ---------------------------------------------------------------------
   WELCOME — shown once, on a client's first sign-in

   Kept in the browser rather than the database: which greeting somebody has
   seen is not the production system's business, and recording it there would
   mean a schema change for a nicety. The trade is that it shows again on a
   new device, which is a small price and arguably rather nice.
--------------------------------------------------------------------- */
function welcomeKey() {
  const id = session && session.user && session.user.id;
  return id ? `mx-welcomed-${id}` : null;
}

function maybeWelcome() {
  const key = welcomeKey();
  if (!key) return;
  let seen = false;
  try { seen = localStorage.getItem(key) === '1'; } catch (e) { /* private mode */ }
  if (!seen) showWelcome();
}

function showWelcome() {
  document.getElementById('welcomeCompany').textContent = myCompany;
  const overlay = document.getElementById('welcomeOverlay');
  overlay.classList.add('open');
  // Focus the card so the greeting is announced and Escape has something to
  // close, rather than leaving focus behind the overlay.
  const card = overlay.querySelector('.welcome-card');
  if (card) { card.setAttribute('tabindex', '-1'); card.focus(); }
}

function closeWelcome(then) {
  document.getElementById('welcomeOverlay').classList.remove('open');
  const key = welcomeKey();
  if (key) { try { localStorage.setItem(key, '1'); } catch (e) { /* private mode */ } }
  if (then === 'order') switchPortalTab('new');
}

// For showing the greeting to someone without having to clear site data:
// run replayWelcome() in the console while signed in.
function replayWelcome() {
  const key = welcomeKey();
  if (key) { try { localStorage.removeItem(key); } catch (e) {} }
  showWelcome();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const overlay = document.getElementById('welcomeOverlay');
  if (overlay && overlay.classList.contains('open')) closeWelcome();
});

async function handlePortalLogout() {
  if (sb) await sb.auth.signOut();
  session = null; myCompany = ''; isStaff = false; queuedLineItems = [];
  showPortalPanel('portalLoginGateway');
  switchAuthPane('signin');
  document.getElementById('portalEmail').value = '';
  document.getElementById('portalPass').value = '';
}

function switchPortalTab(tab) {
  const active = tab === 'active';
  document.getElementById('tabBtnActive').classList.toggle('active-tab', active);
  document.getElementById('tabBtnNew').classList.toggle('active-tab', !active);
  document.getElementById('tabContentActive').style.display = active ? 'block' : 'none';
  document.getElementById('tabContentNew').style.display = active ? 'none' : 'block';
  if (active) fetchMyOrders();
}

async function fetchMyOrders() {
  const list = document.getElementById('activeOrdersList');
  list.innerHTML = `<div class="loading-note">Loading your orders…</div>`;
  try {
    // No customer filter is sent. The database returns this company's orders
    // and nothing else — that's the point of moving the rule server-side.
    const { data: orders, error } = await sb.from('orders')
      .select('*, line_items(*)').eq('deleted', false)
      .order('order_date', { ascending: false });
    if (error) throw error;

    if (!orders || !orders.length) {
      // An empty screen is an invitation, not a dead end — say what to do and
      // what will happen, rather than reporting that nothing is here.
      list.innerHTML = `
        <div class="first-order-panel">
          <h4>Your first order starts here</h4>
          <p>Pick a range, a size and a quantity, and it goes straight onto our
             production system under its own work order number. You will see it
             move through manufacture, packing and shipping on this screen.</p>
          <ol class="first-order-steps">
            <li><strong>Build the order</strong> from the sizes we extrude.</li>
            <li><strong>Send it</strong> and we log it against your account.</li>
            <li><strong>Watch it</strong> through to despatch.</li>
          </ol>
          <button class="btn-solid-red" onclick="switchPortalTab('new')">Place your first order</button>
          <p class="first-order-foot">Would rather talk it through? Call
            <a href="tel:+441624822960">+44 (0)1624 822960</a> or email
            <a href="mailto:sales@creasingmatrix.com">sales@creasingmatrix.com</a>.</p>
        </div>`;
      return;
    }
    list.innerHTML = orders.map(renderOrderCard).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>Your orders could not be loaded. Please try again shortly.</p></div>`;
  }
}

/* ---------------------------------------------------------------------
   ORDER STAGES — a vocabulary shared with the production system

   orders.stage is free text. Nothing in the database constrains it, so these
   four names are a convention between this site and Matrix Sync, not
   something either side can rely on the other to honour. In use at the time
   of writing: Received, Manufacturing, Shipped. Packing is tracked here but
   nothing writes it yet.

   Matching is on the whole name, not a prefix. The previous version compared
   the first four characters, so anything production renamed fell through to
   index 0 and the customer was told their order was still at Received while
   it was being packed. An unrecognised stage is now shown exactly as recorded
   with no step marked, because showing nothing is honest and showing the
   wrong thing is not.

   Adding a name below is a deliberate act: check with production what the
   stage actually means before mapping it, since mapping it wrongly tells a
   customer their order shipped when it has not.
--------------------------------------------------------------------- */
const STAGE_STEPS = ['Received', 'Manufacturing', 'Packing', 'Shipped'];

function stageIndex(stage) {
  const key = String(stage || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return STAGE_STEPS.findIndex(s => s.toLowerCase() === key);
}

function renderOrderCard(ord) {
  const stage = ord.stage || 'Received';
  const idx = stageIndex(stage);          // -1 when production uses a name we do not know
  const known = idx >= 0;
  const lines = ord.line_items || [];
  const items = lines.reduce((t, li) => t + (Number(li.qty) || 0), 0);

  return `
    <article class="factory-order-card">
      <div class="factory-card-header">
        <div>
          <span class="wo-title-badge">${esc(ord.id)}</span>
          ${ord.reference ? `<span class="wo-ref">Your ref ${esc(ord.reference)}</span>` : ''}
        </div>
        <span class="stage-pill ${known ? `stage-step-${idx}` : 'stage-unknown'}">${esc(stage)}</span>
      </div>

      <ol class="stage-track${known ? '' : ' stage-track-unknown'}"
          aria-label="${known ? 'Order progress' : 'Order progress — current stage not tracked'}">
        ${STAGE_STEPS.map((s, i) => `
          <li class="${known ? (i < idx ? 'passed' : i === idx ? 'current' : '') : ''}">
            <span class="dot"></span><span class="lbl">${s}</span>
          </li>`).join('')}
      </ol>
      ${known ? '' : `
        <p class="stage-note">Shown above exactly as production recorded it. Call us on
          <a href="tel:+441624822960">+44 (0)1624 822960</a> if you need more detail.</p>`}

      <div class="order-meta-row">
        <div><span>Ordered</span><strong>${esc(ord.order_date || '—')}</strong></div>
        <div><span>Requested for</span><strong>${esc(ord.due_date || 'Standard lead time')}</strong></div>
        <div><span>Contents</span><strong>${lines.length} lines · ${items} items</strong></div>
      </div>

      ${lines.length ? `
        <table class="line-items-preview-table">
          <thead><tr><th>Product</th><th class="num">Quantity</th></tr></thead>
          <tbody>
            ${lines.map(li => `
              <tr><td>${esc(li.description || 'Matrix profile')}</td>
                  <td class="num">${Number(li.qty) || 0}</td></tr>`).join('')}
          </tbody>
        </table>` : ''}
    </article>`;
}

/* ---------------------------------------------------------------------
   ORDER BUILDER
--------------------------------------------------------------------- */
function populateRanges() {
  const sel = document.getElementById('lineRange');
  if (!sel) return;
  sel.innerHTML = Object.keys(CATALOGUE)
    .map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  handleRangeChange();
}

function handleRangeChange() {
  const range = document.getElementById('lineRange').value;
  const sizeSel = document.getElementById('lineSizeSelect');
  const sizes = CATALOGUE[range] || [];
  sizeSel.innerHTML = sizes.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  handleUnitTypeChange();
}

function handleUnitTypeChange() {
  const range = document.getElementById('lineRange').value;
  const unit = document.getElementById('lineUnitType').value;
  const metres = document.getElementById('lineMeters');
  const list = unit === 'Reel' ? REEL_AMOUNTS : BOX_AMOUNTS;
  metres.innerHTML = list.map(m => `<option value="${m}">${m}m</option>`).join('');
  metres.value = unit === 'Reel' ? 36 : 24;

  // Exceed is ejection rubber: it has no pt rating and is never supplied on
  // a reel, so the fields that don't apply are disabled rather than left to
  // be filled in wrongly.
  const isRubber = range === 'Exceed Rubber';
  const pt = document.getElementById('linePt');
  pt.disabled = isRubber;
  if (isRubber) pt.value = '';
  document.getElementById('lineUnitType').disabled = isRubber;
  if (isRubber) document.getElementById('lineUnitType').value = 'Box';
}

function handleAddLineItemToQueue() {
  const range = document.getElementById('lineRange').value;
  const size = document.getElementById('lineSizeSelect').value;
  const pt = document.getElementById('linePt').disabled ? '' : document.getElementById('linePt').value;
  const unit = document.getElementById('lineUnitType').value;
  const metres = document.getElementById('lineMeters').value;
  const qty = parseInt(document.getElementById('lineQty').value, 10);
  const note = document.getElementById('lineError');

  note.textContent = '';
  if (!size) { note.textContent = 'Choose a size before adding the line.'; return; }
  if (!Number.isFinite(qty) || qty < 10) {
    note.textContent = 'Minimum order is 10 per specification.'; return;
  }
  queuedLineItems.push({
    description: buildLineDescription({ range, size, pt, unit, metres }), qty,
  });
  renderQueue();
  document.getElementById('lineQty').value = 10;
}

function removeQueuedItem(i) { queuedLineItems.splice(i, 1); renderQueue(); }

function renderQueue() {
  const body = document.getElementById('lineItemsTableBody');
  const total = queuedLineItems.reduce((t, i) => t + i.qty, 0);
  document.getElementById('queueTotal').textContent = queuedLineItems.length
    ? `${queuedLineItems.length} line${queuedLineItems.length === 1 ? '' : 's'} · ${total} items`
    : '';
  if (!queuedLineItems.length) {
    body.innerHTML = `<tr><td colspan="3" class="table-empty">Nothing added yet. Choose a product above and add it to the order.</td></tr>`;
    return;
  }
  body.innerHTML = queuedLineItems.map((it, i) => `
    <tr${i === queuedLineItems.length - 1 ? ' class="row-flash"' : ''}>
      <td>${esc(it.description)}</td>
      <td class="num">${it.qty}</td>
      <td class="row-action">
        <button type="button" onclick="removeQueuedItem(${i})">Remove</button>
      </td>
    </tr>`).join('');
}

async function handlePlaceNewOrder(e) {
  e.preventDefault();
  const note = document.getElementById('orderError');
  note.textContent = '';
  if (!queuedLineItems.length) { note.textContent = 'Add at least one product line first.'; return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    // The order id is generated by the database, not by the browser. The old
    // random four-digit number would start colliding with itself after about
    // a hundred orders, and didn't follow the factory's WO-0001 sequence.
    const { data: newOrder, error: orderErr } = await sb.rpc('portal_place_order', {
      p_reference: document.getElementById('newOrderRef').value.trim(),
      p_due_date: document.getElementById('newOrderDueDate').value,
      p_address: document.getElementById('newOrderAddress').value.trim(),
      p_notes: document.getElementById('newOrderNotes').value.trim(),
      p_lines: queuedLineItems,
    });
    if (orderErr) throw orderErr;

    document.getElementById('confirmedWo').textContent = newOrder;
    queuedLineItems = []; renderQueue();
    e.target.reset();
    document.getElementById('newOrderCustomer').value = myCompany;
    document.getElementById('orderConfirmationModal').style.display = 'flex';
  } catch (err) {
    note.textContent = 'The order could not be sent. Please try again, or email sales@creasingmatrix.com.';
  } finally {
    btn.disabled = false; btn.textContent = 'Send order to Matrix Engineering';
  }
}

function closeOrderModal() {
  document.getElementById('orderConfirmationModal').style.display = 'none';
  switchPortalTab('active');
}


/* ---------------------------------------------------------------------
   ADMIN — staff only

   There is no separate admin password. Staff sign in on the same form with
   their own Matrix account and the database reports them as staff; the page
   just shows a different view. The previous version gated this behind a
   passcode written into this file, which anyone could read.

   Every function called here checks staff status inside the database, so
   revealing this screen in the browser achieves nothing on its own.
--------------------------------------------------------------------- */
async function loadAccounts() {
  const body = document.getElementById('adminAccountsBody');
  body.innerHTML = '<tr><td colspan="5" class="table-empty">Loading…</td></tr>';
  const { data, error } = await sb.rpc('portal_list_accounts');
  if (error) { body.innerHTML = '<tr><td colspan="5" class="table-empty">Could not load accounts.</td></tr>'; return; }
  if (!data || !data.length) { body.innerHTML = '<tr><td colspan="5" class="table-empty">No client accounts yet.</td></tr>'; return; }
  // portal_users.status is not a two-value column — Pending rows exist, and
  // my_company() only resolves a company for Active ones. Showing Pending as
  // "Revoked" made an account that had never been switched on look like one
  // that had been switched off.
  body.innerHTML = data.map(a => {
    const active = a.status === 'Active';
    const cls = active ? 'ok-tick' : (a.status === 'Pending' ? 'pending-txt' : 'warn-txt');
    return `
    <tr>
      <td><strong>${esc(a.company_name)}</strong></td>
      <td>${esc(a.contact_email || '—')}</td>
      <td>${a.linked ? '<span class="ok-tick">Has a login</span>' : '<span class="warn-txt">Not invited yet</span>'}</td>
      <td><span class="${cls}">${esc(a.status || 'Unknown')}</span></td>
      <td class="row-action">
        <button type="button" onclick="setAccountStatus('${esc(a.id)}', '${esc(active ? 'Revoked' : 'Active')}')">
          ${active ? 'Revoke' : 'Make active'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function setAccountStatus(id, status) {
  const { error } = await sb.rpc('portal_set_status', { p_id: id, p_status: status });
  if (error) { alert('Could not change that account.'); return; }
  loadAccounts();
}

async function handleLinkAccount(e) {
  e.preventDefault();
  const note = document.getElementById('adminLinkNote');
  const email = document.getElementById('adminLinkEmail').value.trim();
  const company = document.getElementById('adminLinkCompany').value.trim();
  note.textContent = '';
  if (!email || !company) { note.textContent = 'Both fields are needed.'; return; }
  const { error } = await sb.rpc('portal_link_account', { p_email: email, p_company: company });
  if (error) {
    // The database returns a plain reason — usually that they haven't signed
    // up yet — which is more use than a generic failure.
    note.textContent = error.message.replace(/^.*?:\s*/, '');
    return;
  }
  note.className = 'form-note ok'; note.textContent = 'Linked. They can sign in now.';
  e.target.reset();
  loadAccounts();
}

/* ---------------------------------------------------------------------
   NEWS PUBLISHER — staff only

   Two files go up to the news-pdfs bucket: the PDF, and optionally a cover
   photo. The headline is the PDF's own file name with the extension taken
   off — nothing is typed, so whatever staff name the file is what the site
   shows. The headline box is filled in on selection and left read-only so
   that is visible before anyone commits to it.

   The row is written by portal_publish_news, which re-checks staff status
   inside the database, and both the upload and the insert are staff-only at
   the policy level. Revealing this form in the browser achieves nothing on
   its own, which is the whole point — there is no passcode here to find.
--------------------------------------------------------------------- */
const NEWS_BUCKET = 'news-pdfs';

// "Matrix Expands Second Extrusion Line.pdf" -> "Matrix Expands Second Extrusion Line"
// Only the extension goes; spacing and capitalisation are left exactly as typed.
function newsTitleFromFileName(name) {
  return String(name || '').replace(/\.[^.\\/]+$/, '').trim();
}

// Storage keys have to survive being put in a URL. The headline does not come
// from this, so stripping it back to safe characters costs nothing.
function storageKeyFor(prefix, file) {
  const clean = String(file.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '');
  return `${prefix}-${Date.now()}-${clean}`.slice(0, 120);
}

function handleNewsPdfPick() {
  const f = document.getElementById('newsPdf').files[0];
  document.getElementById('newsHeadline').value = f ? newsTitleFromFileName(f.name) : '';
}

async function handlePublishNews(e) {
  e.preventDefault();
  const note = document.getElementById('newsPublishNote');
  const pdf = document.getElementById('newsPdf').files[0];
  const photo = document.getElementById('newsPhoto').files[0];   // optional
  note.className = 'form-note'; note.textContent = '';

  if (!pdf) { note.textContent = 'Choose a PDF to publish.'; return; }
  const title = newsTitleFromFileName(pdf.name);
  if (!title) { note.textContent = 'The PDF needs a file name — that becomes the headline.'; return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const pdfKey = storageKeyFor('pdf', pdf);
    let r = await sb.storage.from(NEWS_BUCKET)
      .upload(pdfKey, pdf, { contentType: 'application/pdf' });
    if (r.error) throw r.error;

    let imageUrl = '';
    if (photo) {
      const imgKey = storageKeyFor('img', photo);
      r = await sb.storage.from(NEWS_BUCKET)
        .upload(imgKey, photo, { contentType: photo.type || 'image/jpeg' });
      if (r.error) throw r.error;
      imageUrl = sb.storage.from(NEWS_BUCKET).getPublicUrl(imgKey).data.publicUrl;
    }

    const { error } = await sb.rpc('portal_publish_news', {
      p_title: title,
      p_pdf_url: sb.storage.from(NEWS_BUCKET).getPublicUrl(pdfKey).data.publicUrl,
      p_image_url: imageUrl,
    });
    if (error) throw error;

    note.className = 'form-note ok';
    note.textContent = `Published \u201c${title}\u201d.`;
    e.target.reset();
    document.getElementById('newsHeadline').value = '';
    loadLiveNews();
  } catch (err) {
    // The database returns a plain reason (e.g. "staff only"), which is more
    // use to the person standing there than a generic failure.
    note.textContent = 'Could not publish that. ' +
      (err && err.message ? String(err.message).replace(/^.*?:\s*/, '') : 'Please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Publish to Latest news';
  }
}

/* ---------------------------------------------------------------------
   ENQUIRIES — plain mailto. No database write, so nothing to secure.
--------------------------------------------------------------------- */
function handleEnquiry(e) {
  e.preventDefault();
  const f = id => document.getElementById(id).value.trim();
  const subject = `Website enquiry — ${f('enqCompany') || 'New enquiry'}`;
  const body =
    `Name:     ${f('enqName')}\n` +
    `Company:  ${f('enqCompany')}\n` +
    `Email:    ${f('enqEmail')}\n` +
    `Phone:    ${f('enqPhone') || '—'}\n` +
    `Interest: ${f('enqInterest')}\n\n${f('enqMessage')}`;
  window.location.href =
    `mailto:sales@creasingmatrix.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  document.getElementById('enquirySent').hidden = false;
}

/* ---------------------------------------------------------------------
   MATRIX CALCULATOR
--------------------------------------------------------------------- */
function calculateMatrix() {
  const caliper = parseFloat(document.getElementById('boardCaliper').value) || 0;
  const rule = parseFloat(document.getElementById('creasingRule').value) || 0;
  const board = document.getElementById('boardType').value;
  document.getElementById('caliperVal').textContent = `${caliper.toFixed(2)} mm`;
  if (caliper <= 0 || rule <= 0) return;

  const round = n => (Math.round(n * 20) / 20).toFixed(2);
  document.getElementById('resDepth').textContent = round(caliper * 0.9);
  document.getElementById('resWidth').textContent = round(caliper * 1.5 + rule);
  document.getElementById('resProduct').textContent =
    board === 'recycled' ? 'Ultra-SR (polyester base)'
    : (caliper > 0.8 || board === 'solid') ? 'Phoenix XL (wide base)'
    : 'Phoenix+ (polymer base)';
}

/* ---------------------------------------------------------------------
   BOOT
--------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  // Someone following an invitation or a reset link is landing on the site for
  // a specific reason, so they go to the hub rather than the home page.
  navigateTo(ARRIVED_FROM_EMAIL ? 'portal'
           : (window.location.hash.replace('#', '') || 'home'));
  populateRanges();
  renderQueue();
  loadLiveNews();

  ['boardCaliper', 'creasingRule', 'boardType'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'boardCaliper' ? 'input' : 'change', calculateMatrix);
  });
  calculateMatrix();

  // A returning customer stays signed in rather than typing their password
  // on every visit.
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      session = data.session;
      // Arriving on an invitation or reset link: set a password first, then
      // carry on into whichever panel the database says they belong in.
      if (ARRIVED_FROM_EMAIL && !ARRIVED_FROM_EMAIL.error) showSetPassword();
      else await enterPortal();
    } else if (ARRIVED_FROM_EMAIL) {
      // The link carried a token but no session came of it — expired, already
      // used, or tampered with. All three need the same thing: a new one.
      switchAuthPane('signin');
      document.getElementById('portalLoginError').textContent =
        'That link has expired or has already been used. Call us and we will send a new one.';
    }
  }
});

Object.assign(window, {
  handlePortalLogin, handlePortalLogout, switchPortalTab,
  switchAuthPane, handlePasswordReset, handleSetPassword,
  closeWelcome, replayWelcome,
  handlePublishNews, handleNewsPdfPick,
  handleRangeChange, handleUnitTypeChange, handleAddLineItemToQueue,
  removeQueuedItem, handlePlaceNewOrder, closeOrderModal, handleEnquiry,
  loadAccounts, setAccountStatus, handleLinkAccount,
});
