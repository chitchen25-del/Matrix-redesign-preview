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
/* The size list comes from the factory, and the description string comes with
   it. The site used to hold its own copy of the catalogue and assemble the
   description in the browser from range, size, rule and metres. Both are gone:

   - The list is portal_size_list, a view over the factory's own products,
     active and orderable only. A hand-kept copy drifts, and the symptom is a
     customer ordering something nobody makes.
   - The description is sent back exactly as the view gave it. It is the string
     the production system matches an order line on, so building it here would
     mean the two versions diverging the first time a naming rule changed.

   Nothing in this file constructs a product name any more. If you find
   yourself about to, that is the bug. */
let sizeList = [];        // rows from portal_size_list
let sizeListLoaded = false;

/* The public pages sell names the factory catalogue does not use. Both are
   shown so a customer recognises the range and still sees the name that will
   appear on their work order. Ranges not in this map show their catalogue
   name as-is. */
const RANGE_LABELS = {
  'PX Plus': 'Phoenix+ (PX Plus)',
  'Ultra SR': 'Ultra-SR',
  'Exceed': 'Exceed Rubber',
};
function rangeLabel(family) { return RANGE_LABELS[family] || family; }

async function loadSizeList() {
  const note = document.getElementById('sizeListNote');
  if (!sb) return;
  const { data, error } = await sb
    .from('portal_size_list')
    .select('description, family, form, metres, thickness, gos, pt')
    .order('family').order('description');

  if (error || !data) {
    sizeList = []; sizeListLoaded = false;
    if (note) {
      note.className = 'builder-note warn';
      note.textContent = 'The size list could not be loaded, so ordering is unavailable. ' +
        'Please call +44 (0)1624 822960 and we will take the order directly.';
    }
    return;
  }
  sizeList = data; sizeListLoaded = true;
  if (note) {
    note.className = 'builder-note';
    note.textContent = `${data.length} sizes, live from the factory list.`;
  }
  populateRanges();
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
  faults: ['What goes wrong, and why',
    'Creasing faults and their causes: cracking on the fold, bursting on the press, matrix lifting or crushing, off-centre creases, corner splitting, angel hair and hardened ejection rubber.'],
  technical: ['Technical guidance',
    'Matrix sizing for board caliper and rule thickness, fitting guidance, and the full printable technical brochure.'],
  accessories: ['Accessories',
    'Shim, patching tape and makeready consumables for the die shop.'],
  news: ['Latest news',
    'Announcements and technical bulletins from Matrix Engineering.'],
  contact: ['Contact us',
    'Ballasalla, Isle of Man. Call +44 (0)1624 822960 or email sales@creasingmatrix.com for samples and enquiries.'],
  'hub-guide': ['How ordering with us works',
    'A walkthrough of the Matrix Engineering client hub: getting your login, placing an order, prices and acknowledgements, tracking it through the factory, and talking to us about it.'],
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

const navScrim = document.getElementById('navScrim');

menuToggle.addEventListener('click', () => {
  const open = menuToggle.classList.toggle('open');
  siteNav.classList.toggle('mobile-active');
  if (navScrim) navScrim.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

// Tapping the scrim, or pressing Escape, closes the menu — the same job the
// toggle does, so it is written once and called from both.
function closeMobileNav() {
  menuToggle.classList.remove('open');
  siteNav.classList.remove('mobile-active');
  if (navScrim) navScrim.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && siteNav.classList.contains('mobile-active')) closeMobileNav();
});

function navigateTo(pageId) {
  closeMobileNav();
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
let isSales = false;

/* Exactly one of the four portal panels is ever on screen. Keeping that in
   one place stops the display flags drifting apart as panels get added. */
const PORTAL_PANELS = ['portalLoginGateway', 'portalSetPassword', 'portalPending',
                       'portalAdmin', 'portalSales', 'portalDashboard'];
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
  const { data: who, error } = await sb.rpc('portal_role');
  if (error) {
    document.getElementById('portalLoginError').textContent =
      'Could not verify your account. Please try again shortly.';
    await sb.auth.signOut(); session = null; return;
  }
  isStaff = !!(who && who.staff);
  isSales = !!(who && who.sales);

  if (isStaff) {
    showPortalPanel('portalAdmin');
    await loadAccounts();
    return;
  }

  // Sales before company: if Mark is ever also linked to a company for testing,
  // the sales panel is what he is here for.
  if (isSales) {
    showPortalPanel('portalSales');
    await loadSalesClients();
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
  await loadSizeList();
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

/* ---------------------------------------------------------------------
   SALES — invite clients

   The invitation goes through the invite-client Edge Function, because
   sending one needs the service-role key and that never comes near this
   file. The function checks with the database who is asking, and the
   function it calls to link the account checks again before it writes.
--------------------------------------------------------------------- */
async function handleInviteClient(e) {
  e.preventDefault();
  const note = document.getElementById('inviteNote');
  const company = document.getElementById('inviteCompany').value.trim();
  const email = document.getElementById('inviteEmail').value.trim();
  note.className = 'form-note'; note.textContent = '';
  if (!sb) { note.textContent = 'Cannot reach the server. Please try again shortly.'; return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const { data, error } = await sb.functions.invoke('invite-client', {
      body: {
        email, company,
        // Where the invitation link brings them back to. Sent from here so it
        // works the same in preview and on the live domain.
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error || !data || data.error) {
      note.textContent = (data && data.error) || 'That invitation could not be sent.';
      return;
    }
    note.className = 'form-note ok';
    note.textContent = data.message || `Invitation sent to ${email}.`;
    e.target.reset();
    await loadSalesClients();
  } catch (err) {
    note.textContent = 'That invitation could not be sent. Please try again shortly.';
  } finally {
    btn.disabled = false; btn.textContent = 'Send the invitation';
  }
}

async function loadSalesClients() {
  const body = document.getElementById('salesClientsBody');
  body.innerHTML = '<tr><td colspan="4" class="table-empty">Loading…</td></tr>';
  const { data, error } = await sb.rpc('portal_sales_list_clients');
  if (error) {
    body.innerHTML = '<tr><td colspan="4" class="table-empty">Could not load the client list.</td></tr>';
    return;
  }
  if (!data || !data.length) {
    body.innerHTML = '<tr><td colspan="4" class="table-empty">No clients invited yet.</td></tr>';
    return;
  }
  body.innerHTML = data.map(c => {
    const active = c.status === 'Active';
    const cls = active ? 'ok-tick' : (c.status === 'Pending' ? 'pending-txt' : 'warn-txt');
    // "Invited" and "accepted" are different things, and the gap between them
    // is exactly what a salesperson wants to see.
    const invite = !c.linked ? '<span class="warn-txt">Not invited</span>'
                 : c.accepted ? '<span class="ok-tick">Accepted</span>'
                 : '<span class="pending-txt">Sent, not accepted</span>';
    return `
    <tr>
      <td><strong>${esc(c.company_name)}</strong></td>
      <td>${esc(c.contact_email || '—')}</td>
      <td>${invite}</td>
      <td><span class="${cls}">${esc(c.status || 'Unknown')}</span></td>
    </tr>`;
  }).join('');
}

async function handlePortalLogout() {
  if (sb) await sb.auth.signOut();
  session = null; myCompany = ''; isStaff = false; isSales = false; queuedLineItems = [];
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

/* ---------------------------------------------------------------------
   MESSAGES — the customer's half of the thread

   Matrix reads and replies in Matrix Sync. This end is deliberately thin:
   the policies decide what a customer may do, and none of it is re-checked
   here. A customer reads and writes only on their own orders, author_side is
   forced to 'customer' by the insert policy, and read_at is the other side
   saying it has seen something — not this one.
--------------------------------------------------------------------- */
let orderMessages = {};                 // order_id -> messages
let orderAcks = {};                     // order_id -> newest acknowledgement
const openThreads = new Set();          // which threads are expanded

function contactName() {
  const u = (session && session.user) || {};
  const meta = u.user_metadata || {};
  if (meta.contact_name) return `${meta.contact_name} at ${myCompany}`;
  return myCompany;
}

function renderUnreadBadge() {
  const el = document.getElementById('ordersUnread');
  if (!el) return;
  const n = Object.values(orderMessages).flat()
    .filter(m => m.author_side === 'matrix' && !m.read_at && !m.withdrawn_at).length;
  el.textContent = n ? String(n) : '';
  el.style.display = n ? '' : 'none';
}

async function toggleThread(orderId) {
  if (openThreads.has(orderId)) {
    openThreads.delete(orderId);
  } else {
    openThreads.add(orderId);
    await markMatrixMessagesRead(orderId);
  }
  await refreshOrders();
}

/* Marks Matrix's messages read, never the customer's own — the flag is this
   side telling Dave his answer landed, and Matrix Sync shows "seen" against
   his message once it is set.

   Deliberately an RPC, not an UPDATE. There is no customer UPDATE policy on
   order_messages and there should not be: a row policy constrains which rows,
   not which columns, so it would also have let a customer rewrite the body of
   a message Matrix sent. The function stamps now() itself, so a receipt
   cannot be back-dated or undone either. */
async function markMatrixMessagesRead(orderId) {
  const unread = (orderMessages[orderId] || [])
    .filter(m => m.author_side === 'matrix' && !m.read_at && !m.withdrawn_at);
  if (!unread.length) return;
  try {
    await sb.rpc('mark_messages_read', { p_order_id: orderId });
  } catch (e) { /* never block reading a thread on a receipt */ }
}

async function handlePostMessage(e, orderId) {
  e.preventDefault();
  const box = document.getElementById(`msg-${orderId}`);
  const err = document.getElementById(`msgErr-${orderId}`);
  const body = box.value.trim();
  err.textContent = '';
  if (!body) { err.textContent = 'Write something first.'; return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const { error } = await sb.from('order_messages').insert({
      id: 'msg-' + crypto.randomUUID(),
      order_id: orderId,
      body,
      author_side: 'customer',
      author_name: contactName(),
    });
    if (error) throw error;
    box.value = '';
    await refreshOrders();
  } catch (ex) {
    err.textContent = 'That message could not be sent. Please try again, or call us on ' +
      '+44 (0)1624 822960.';
  } finally {
    btn.disabled = false; btn.textContent = 'Send';
  }
}

// Re-reads orders and messages together, so a thread and its unread count
// never disagree.
async function refreshOrders() { await fetchMyOrders(); }

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

    /* Every message this customer is allowed to see, in one request. RLS
       scopes it to their own orders, so no filter is sent from here — same
       reasoning as the orders query above. Fetching per card would be one
       round trip per order and would still need the whole set for the
       unread count. */
    const { data: msgs } = await sb.from('order_messages')
      .select('id, order_id, body, author_side, author_name, created_at, read_at, withdrawn_at')
      .eq('deleted', false).order('created_at');
    orderMessages = {};
    (msgs || []).forEach(m => {
      (orderMessages[m.order_id] = orderMessages[m.order_id] || []).push(m);
    });
    renderUnreadBadge();

    /* The acknowledgement Steve confirmed, not a fresh render of it. If a price
       changes afterwards a new row is written, so the newest by created_at is
       the current one and the older rows are the record of what was agreed
       before. The html itself is only fetched when the customer opens it —
       these are whole documents and there is no sense carrying them around for
       orders nobody looks at. */
    const { data: acks } = await sb.from('order_acknowledgements')
      .select('id, order_id, total, currency, created_at, opened_at')
      .eq('deleted', false).order('created_at', { ascending: false });
    /* A person confirmed this order, and saying who is the most literal form of
       "made by people". orders.confirmed_by already holds it; the hub simply
       never showed it. */
    const byWho = {};
    (orders || []).forEach(o => { if (o.confirmed_by) byWho[o.id] = o.confirmed_by; });
    orderAcks = {};
    (acks || []).forEach(a => {
      if (!orderAcks[a.order_id]) orderAcks[a.order_id] = { ...a, confirmed_by: byWho[a.order_id] };
    });

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
  const priced = !!ord.confirmed_at;
  const orderTotal = lines.reduce(
    (t, li) => t + (Number(li.unit_price) || 0) * (Number(li.qty) || 0), 0);

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
        <div><span>Contents</span><strong>${lines.length} line${lines.length === 1 ? '' : 's'} · ${items} item${items === 1 ? '' : 's'}</strong></div>
      </div>

      ${lines.length ? `
        <table class="line-items-preview-table${priced ? ' priced' : ''}">
          <thead><tr><th>Product</th><th class="num">Quantity</th>
            ${priced ? '<th class="num">Unit</th><th class="num">Line</th>' : ''}</tr></thead>
          <tbody>
            ${lines.map(li => `
              <tr><td>${esc(li.description || 'Matrix profile')}</td>
                  <td class="num">${Number(li.qty) || 0}</td>
                  ${priced ? `<td class="num">${money(li.unit_price)}</td>
                              <td class="num">${money((Number(li.unit_price)||0) * (Number(li.qty)||0))}</td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
        ${priced ? `
          <div class="order-total-row">
            <span>Order total <span class="ex-vat">excluding VAT</span></span>
            <strong>${money(orderTotal)}</strong>
          </div>` : ''}` : ''}

      ${priced ? '' : (idx >= 2
        /* An order already packed or shipped is not waiting on pricing in any
           sense the customer would recognise — promising it "shortly" on an
           order that left the building weeks ago reads as nonsense. Say what
           is true instead: there are no figures here, and here is who to ask. */
        ? `<p class="price-pending">No prices are shown for this order. If you need them,
             message us below or call <a href="tel:+441624822960">+44 (0)1624 822960</a>.</p>`
        : `<p class="price-pending">We will confirm your prices shortly — usually the same
             working day. Nothing is priced until we have checked it, so this order shows
             no figures yet.</p>`)}

      ${renderAck(ord.id)}
      ${renderThread(ord.id)}
    </article>`;
}

/* Prices are the factory's. A hub order lands with every unit_price at 0 and
   confirmed_at null until Steve prices it, and a zero on screen reads as free
   — so nothing is shown as a price until the order is confirmed. */
const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
function money(v) { return GBP.format(Number(v) || 0); }

/* The acknowledgement is the document Steve confirmed. It is not an invoice —
   it carries the work order number, nothing is payable against it, and Xero
   issues the invoice on despatch. The link must never be labelled one. */
function renderAck(orderId) {
  const ack = orderAcks[orderId];
  if (!ack) return '';
  return `
    <div class="ack-row">
      <div class="ack-text">
        <strong>Order acknowledgement</strong>
        <span>${ack.confirmed_by ? `Confirmed by ${esc(ack.confirmed_by)}, ` : 'Confirmed '}${
          fmtWhen(ack.created_at)}${ack.total != null ? ` · ${money(ack.total)}` : ''} · not an invoice</span>
      </div>
      <button type="button" class="btn-ghost-sm" onclick="openAck('${esc(orderId)}')">
        View document
      </button>
    </div>`;
}

async function openAck(orderId) {
  const frame = document.getElementById('ackFrame');
  const modal = document.getElementById('ackModal');
  document.getElementById('ackWo').textContent = orderId;
  frame.removeAttribute('srcdoc');
  modal.style.display = 'flex';

  const { data, error } = await sb.from('order_acknowledgements')
    .select('html').eq('order_id', orderId).eq('deleted', false)
    .order('created_at', { ascending: false }).limit(1);

  if (error || !data || !data.length) {
    document.getElementById('ackError').textContent =
      'That document could not be loaded. Please call us on +44 (0)1624 822960.';
    return;
  }
  document.getElementById('ackError').textContent = '';
  ackHtml = data[0].html;

  /* Rendered inside a sandboxed iframe with no allow-scripts, so nothing in
     the document can run. The html is built on the Matrix side from order
     fields the customer supplied — their reference, their notes — and this
     page has no way to know how carefully those were escaped. Sandboxing
     makes that someone else's problem rather than ours. */
  frame.srcdoc = ackHtml;

  // Only once it is genuinely open. Matrix shows Dave which acknowledgements
  // have sat unopened so he can ring those customers; firing this on page
  // load would have him chasing nobody.
  try { await sb.rpc('mark_acknowledgement_opened', { p_order_id: orderId }); }
  catch (e) { /* the customer has still seen it; the nudge is not their problem */ }
}

let ackHtml = '';
function closeAck() {
  document.getElementById('ackModal').style.display = 'none';
  document.getElementById('ackFrame').removeAttribute('srcdoc');
  ackHtml = '';
}
function printAck() {
  const w = document.getElementById('ackFrame').contentWindow;
  if (w) { w.focus(); w.print(); }
}
function downloadAck() {
  if (!ackHtml) return;
  const wo = document.getElementById('ackWo').textContent;
  const url = URL.createObjectURL(new Blob([ackHtml], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url; a.download = `Matrix-acknowledgement-${wo}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function renderThread(orderId) {
  const msgs = orderMessages[orderId] || [];
  const unread = msgs.filter(m => m.author_side === 'matrix' && !m.read_at && !m.withdrawn_at).length;
  const open = openThreads.has(orderId);

  return `
    <div class="thread-block${open ? ' open' : ''}">
      <button type="button" class="thread-toggle" onclick="toggleThread('${esc(orderId)}')"
              aria-expanded="${open}">
        <span>Messages about this order${msgs.length ? ` (${msgs.length})` : ''}</span>
        ${unread ? `<span class="thread-unread">${unread} new</span>` : ''}
        <span class="thread-chev" aria-hidden="true">${open ? '−' : '+'}</span>
      </button>

      ${open ? `
        <div class="thread-body">
          ${msgs.length ? msgs.map(m => `
            <div class="msg msg-${m.author_side === 'matrix' ? 'matrix' : 'customer'}${
                 m.withdrawn_at ? ' msg-withdrawn' : ''}">
              <div class="msg-meta">
                <strong>${esc(m.author_name || (m.author_side === 'matrix' ? 'Matrix Engineering' : 'You'))}</strong>
                <span>${fmtWhen(m.created_at)}</span>
              </div>
              <p>${esc(m.body)}</p>
              ${m.withdrawn_at
                ? `<span class="msg-withdrawn-note">Matrix withdrew this ${fmtWhen(m.withdrawn_at)}</span>`
                : ''}
            </div>`).join('')
          : `<p class="thread-empty">Nothing yet. Anything you need to tell us about this
               order — a change, a query, a delivery note — start it here and it reaches
               the people handling it.</p>`}

          <form class="thread-form" onsubmit="handlePostMessage(event, '${esc(orderId)}')">
            <label class="sr-only" for="msg-${esc(orderId)}">Your message</label>
            <textarea id="msg-${esc(orderId)}" rows="2" required
                      placeholder="Type your message…"></textarea>
            <p class="form-error" id="msgErr-${esc(orderId)}" role="alert"></p>
            <button type="submit" class="btn-solid-navy">Send</button>
          </form>
        </div>` : ''}
    </div>`;
}

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('en-GB',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ---------------------------------------------------------------------
   ORDER BUILDER
--------------------------------------------------------------------- */
function populateRanges() {
  const sel = document.getElementById('lineRange');
  if (!sel || !sizeListLoaded) return;
  const families = [...new Set(sizeList.map(r => r.family))];
  sel.innerHTML = families
    .map(f => `<option value="${esc(f)}">${esc(rangeLabel(f))}</option>`).join('');
  handleRangeChange();
}

function handleRangeChange() {
  const family = document.getElementById('lineRange').value;
  const formSel = document.getElementById('lineUnitType');
  const sizeSel = document.getElementById('lineSizeSelect');

  // Only offer Box or Reel where that range actually has them. Exceed is
  // ejection rubber and never comes on a reel; most ranges are box only.
  const forms = [...new Set(sizeList.filter(r => r.family === family).map(r => r.form))];
  const wanted = formSel.value;
  formSel.innerHTML = forms.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  if (forms.includes(wanted)) formSel.value = wanted;
  formSel.disabled = forms.length < 2;

  const form = formSel.value;
  const rows = sizeList.filter(r => r.family === family && r.form === form);
  sizeSel.innerHTML = rows
    .map(r => `<option value="${esc(r.description)}">${esc(r.description)}</option>`).join('');
}

function handleAddLineItemToQueue() {
  const note = document.getElementById('lineError');
  const description = document.getElementById('lineSizeSelect').value;
  const qty = parseInt(document.getElementById('lineQty').value, 10);
  const customerRef = document.getElementById('lineCustomerRef').value.trim();

  note.textContent = '';
  if (!sizeListLoaded) { note.textContent = 'The size list has not loaded yet.'; return; }
  if (!description) { note.textContent = 'Choose a size before adding the line.'; return; }
  if (!Number.isInteger(qty) || qty < 1) {
    note.textContent = 'Enter a whole number of boxes, one or more.'; return;
  }

  // description goes in untouched — it is the factory's string, not ours.
  const line = { description, qty };
  if (customerRef) line.customerRef = customerRef;
  queuedLineItems.push(line);

  renderQueue();
  document.getElementById('lineQty').value = 10;
  document.getElementById('lineCustomerRef').value = '';
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
    /* place_portal_order does the work the site used to attempt itself: it
       allocates the work order number under a lock, takes the customer from
       the login rather than the page, forces stage and source, ignores any
       price sent, and checks every line against the live catalogue before it
       writes anything — so a bad line cannot leave half an order behind. */
    const { data: workOrderNumber, error } = await sb.rpc('place_portal_order', {
      p_reference: document.getElementById('newOrderRef').value.trim() || null,
      p_due_date:  document.getElementById('newOrderDueDate').value || null,
      /* Not the customer's to choose. A product ships in its own carton unless
         a salesman has agreed otherwise, and production changes it their side
         if so — so this is always sent empty rather than guessed at here. */
      p_box_type:  null,
      p_notes:     document.getElementById('newOrderNotes').value.trim() || null,
      p_address:   document.getElementById('newOrderAddress').value.trim() || null,
      p_lines:     queuedLineItems,
    });
    if (error) throw error;

    document.getElementById('confirmedWo').textContent = workOrderNumber;
    queuedLineItems = []; renderQueue();
    e.target.reset();
    document.getElementById('newOrderCustomer').value = myCompany;
    document.getElementById('orderConfirmationModal').style.display = 'flex';
  } catch (err) {
    /* The function's own messages are written for the customer and say
       something useful — which line, which product, what to do. Showing a
       generic failure instead would throw that away. */
    const msg = String((err && err.message) || '').trim();
    note.textContent = msg
      ? msg
      : 'The order could not be sent. Please try again, or email sales@creasingmatrix.com.';
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
/* ---------------------------------------------------------------------
   THE SIZE CHARTS AS DATA

   Read out of the charts already on the product pages rather than kept as a
   second copy here. There is one source of truth for what we extrude, it is
   the table a customer can see, and a map maintained alongside it would drift
   the first time a size changed.

   Colour is not a global ladder — Silver is 0.38, 0.55 and 1.20mm depending on
   the profile, and four different colours sit at 0.38mm. So a colour only
   means something alongside its range and profile, which is why every match is
   reported with all three.
--------------------------------------------------------------------- */
const RANGE_NAMES = {
  'view-phoenix-plus': 'Phoenix+',
  'view-phoenix-xl': 'Phoenix XL',
  'view-ultra-sr': 'Ultra-SR',
};
let matrixIndex = null;

function buildMatrixIndex() {
  if (matrixIndex) return matrixIndex;
  matrixIndex = [];
  Object.keys(RANGE_NAMES).forEach(viewId => {
    const view = document.getElementById(viewId);
    if (!view) return;
    view.querySelectorAll('.chart-block').forEach(block => {
      const profile = (block.querySelector('h4') || {}).textContent || '';
      const heads = [...block.querySelectorAll('thead th')].map(t => t.textContent.trim().toLowerCase());
      // Exceed is ejection rubber, not a creasing matrix — its charts are
      // shaped differently and it has no business in a matrix size result.
      if (!heads.length || heads[0] !== 'base colour') return;
      block.querySelectorAll('tbody tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 3) return;
        const sw = tds[0].querySelector('.sw');
        const colour = (tds[0].textContent || '').trim();
        const height = parseFloat((tds[1].textContent || '').replace(/[^0-9.]/g, ''));
        const widths = (tds[2].textContent || '').split(',')
          .map(w => parseFloat(w.replace(/[^0-9.]/g, ''))).filter(w => !isNaN(w));
        if (isNaN(height) || !widths.length) return;
        matrixIndex.push({
          range: RANGE_NAMES[viewId], profile, colour,
          cls: sw ? [...sw.classList].find(c => c.startsWith('c-')) : null,
          height, widths,
        });
      });
    });
  });
  return matrixIndex;
}

/* Everything we extrude that fits the calculated size, nearest width first.
   A customer does not want one suggestion, they want to know what is on the
   shelf at that size and what it is called. */
function renderMatrixMatches(depth, width, suggestedRange) {
  const host = document.getElementById('calcMatches');
  if (!host) return;
  const rows = buildMatrixIndex();

  const hits = [];
  rows.forEach(r => {
    if (Math.abs(r.height - depth) > 0.06) return;
    let best = null;
    r.widths.forEach(w => {
      const d = Math.abs(w - width);
      if (d <= 0.16 && (!best || d < best.d)) best = { w, d };
    });
    if (best) hits.push({ ...r, width: best.w, delta: best.d });
  });
  // The suggested range leads. Listing a Phoenix XL match above a Phoenix+ one
  // when the tool has just recommended Phoenix+ reads as the tool contradicting
  // itself, even though both are true.
  const rank = r => (suggestedRange && r.range === suggestedRange ? 0 : 1);
  hits.sort((a, b) => rank(a) - rank(b) || a.delta - b.delta || a.range.localeCompare(b.range));

  /* One colour at one size turns up on several profiles, so listing every row
     gave six lines that read as the same answer repeated. Grouped by what the
     customer is actually choosing between — the colour and the size — with the
     profiles it comes on named alongside. */
  const groups = [];
  const byKey = {};
  hits.forEach(m => {
    const key = `${m.range}|${m.colour}|${m.height}|${m.width}`;
    if (!byKey[key]) { byKey[key] = { ...m, profiles: [] }; groups.push(byKey[key]); }
    byKey[key].profiles.push(m.profile);
  });

  if (!groups.length) {
    const cdn = document.getElementById('calcDraw');
    if (cdn) cdn.innerHTML = drawProfile(depth, width, 12, {});
    host.innerHTML = `<p class="match-none">Nothing on the standard charts sits at exactly
      this size. Call <a href="tel:+441624822960">+44 (0)1624 822960</a> — odd sizes are
      what we do.</p>`;
    return;
  }
  const cd = document.getElementById('calcDraw');
  if (cd) cd.innerHTML = drawProfile(groups[0].height, groups[0].width,
                                     baseFromProfile(groups[0].profiles[0]), {});

  const shown = groups.slice(0, 5);
  host.innerHTML = shown.map(m => `
    <div class="match-row">
      <span class="sw ${esc(m.cls || '')}" aria-hidden="true"></span>
      <span class="match-colour">${esc(m.colour)}</span>
      <span class="match-size mono">${m.height.toFixed(2)} × ${m.width.toFixed(2)}mm</span>
      <span class="match-where">${esc(m.range)} · ${esc(m.profiles.join(', '))}</span>
    </div>`).join('') +
    (groups.length > shown.length
      ? `<p class="match-more">and ${groups.length - shown.length} more at this size</p>` : '');
}

/* ---------------------------------------------------------------------
   HERO SIZE FINDER

   The short version of the tool on the Technical page, using the same charts
   and the same arithmetic. It exists because the question a die-maker arrives
   with is "what do I need for this board", and answering it in the first
   screenful is worth more than a claim about precision.
--------------------------------------------------------------------- */
/* Everyone offers free samples. The difference here is that the finder already
   knows the board, the rule and the sizes that fit — so the request arrives
   specified, rather than as "please send me some matrix". */
function requestSamples() {
  const cal = parseFloat(document.getElementById('heroCaliper').value) || 0;
  const ruleSel = document.getElementById('heroRule');
  const rule = ruleSel.options[ruleSel.selectedIndex].textContent.trim();
  const depth = document.getElementById('heroDepth').textContent;
  const width = document.getElementById('heroWidth').textContent;

  const hits = buildMatrixIndex().filter(r =>
    Math.abs(r.height - parseFloat(depth)) <= 0.06 &&
    r.widths.some(w => Math.abs(w - parseFloat(width)) <= 0.16));
  const seen = new Set();
  const lines = hits.filter(m => {
    const k = `${m.range}|${m.colour}|${m.height}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 6).map(m => {
    const w = m.widths.reduce((b, x) =>
      Math.abs(x - parseFloat(width)) < Math.abs(b - parseFloat(width)) ? x : b, m.widths[0]);
    return `  ${m.range} — ${m.colour} ${m.height.toFixed(2)} x ${w.toFixed(2)}mm (${m.profile})`;
  });

  const body =
    `Please send samples to trial.\n\n` +
    `Board caliper: ${cal.toFixed(2)} mm\n` +
    `Creasing rule: ${rule}\n` +
    `Starting size: ${depth} x ${width} mm\n\n` +
    (lines.length ? `Sizes from your finder:\n${lines.join('\n')}\n\n`
                  : `Nothing on the standard charts matched this size.\n\n`) +
    `Company:\nContact:\nDelivery address:\n`;

  window.location.href = 'mailto:sales@creasingmatrix.com?subject=' +
    encodeURIComponent(`Sample request — ${depth} x ${width}mm`) +
    '&body=' + encodeURIComponent(body);
}

/* ---------------------------------------------------------------------
   THE SIZE, DRAWN

   The calculator returns numbers; this draws what those numbers are. Same
   cross-section language as the fault diagrams — feathered outer edge up to a
   plateau, vertical wall into the channel — scaled to the actual figures.

   The vertical is exaggerated against the horizontal, as every matrix section
   drawing in this trade is: a 0.50mm shoulder on a 12mm base drawn true would
   be a flat line. The caption says so rather than leaving it implied.
--------------------------------------------------------------------- */
function drawProfile(depthMM, widthMM, baseMM, opts) {
  opts = opts || {};
  const W = 260, H = opts.compact ? 92 : 118;
  const HX = 15;                         // units per mm across
  const VY = 34;                         // units per mm up — deliberately not to scale
  const plateY = H - (opts.compact ? 16 : 26);
  const base = Math.min(baseMM * HX, W - 30);
  const half = Math.max((widthMM * HX) / 2, 3);
  const sh   = Math.max(depthMM * VY, 6);
  const cx = W / 2, top = plateY - sh;
  const lo = cx - base / 2, ro = cx + base / 2;
  const taper = Math.min(base * 0.28, 34);

  const boardY = top - 6;
  const dip = Math.min(sh * 0.9, 16);

  return `
  <svg viewBox="0 0 ${W} ${H}" class="profile-draw" role="img"
       aria-label="Cross-section: ${depthMM.toFixed(2)}mm deep, ${widthMM.toFixed(2)}mm channel">
    <rect x="6" y="${plateY}" width="${W-12}" height="6" rx="2" fill="var(--pd-plate)"/>
    <path d="M${lo} ${plateY} L${lo+taper} ${top} L${cx-half} ${top} L${cx-half} ${plateY} Z" fill="var(--pd-navy)"/>
    <path d="M${ro} ${plateY} L${ro-taper} ${top} L${cx+half} ${top} L${cx+half} ${plateY} Z" fill="var(--pd-navy)"/>
    <path d="M12 ${boardY} H${cx-half-3} Q${cx-half} ${boardY} ${cx-half+2} ${boardY+dip*0.5}
             L${cx} ${boardY+dip} L${cx+half-2} ${boardY+dip*0.5}
             Q${cx+half} ${boardY} ${cx+half+3} ${boardY} H${W-12}"
          stroke="var(--pd-board)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${cx-2}" y="4" width="4" height="${boardY+dip-4}" rx="1" fill="var(--pd-red)"/>

    <line x1="${cx-half}" y1="${top-13}" x2="${cx+half}" y2="${top-13}"
          stroke="var(--pd-dim)" stroke-width="1"/>
    <text x="${cx}" y="${top-16}" text-anchor="middle" font-size="9"
          fill="var(--pd-dim)" font-family="var(--font-mono)">${widthMM.toFixed(2)}</text>
    <line x1="${ro+6}" y1="${top}" x2="${ro+6}" y2="${plateY}" stroke="var(--pd-dim)" stroke-width="1"/>
    <text x="${ro+10}" y="${(top+plateY)/2+3}" font-size="9"
          fill="var(--pd-dim)" font-family="var(--font-mono)">${depthMM.toFixed(2)}</text>
    ${opts.compact ? '' : `<text x="${cx}" y="${H-6}" text-anchor="middle" font-size="8.5"
       fill="var(--pd-dim)" font-family="var(--font-mono)">${baseMM}mm base · height exaggerated</text>`}
  </svg>`;
}

/* The base the drawing should sit on, taken from the matching product's own
   profile name rather than assumed. */
function baseFromProfile(profile) {
  const m = /(\d+)\s*mm/.exec(profile || '');
  return m ? parseInt(m[1], 10) : 12;
}

function heroFind() {
  const cal = parseFloat(document.getElementById('heroCaliper').value) || 0;
  const rule = parseFloat(document.getElementById('heroRule').value) || 0;
  const round = n => (Math.round(n * 20) / 20).toFixed(2);
  const depth = parseFloat(round(cal * 0.9));
  const width = parseFloat(round(cal * 1.5 + rule));

  document.getElementById('heroCaliperVal').textContent = `${cal.toFixed(2)} mm`;
  document.getElementById('heroDepth').textContent = depth.toFixed(2);
  document.getElementById('heroWidth').textContent = width.toFixed(2);

  const draw = document.getElementById('heroDraw');
  const host = document.getElementById('heroMatch');
  const hits = buildMatrixIndex().filter(r =>
    Math.abs(r.height - depth) <= 0.06 && r.widths.some(w => Math.abs(w - width) <= 0.16));
  if (!hits.length) {
    if (draw) draw.innerHTML = drawProfile(depth, width, 12, { compact: true });
    host.innerHTML = `<span class="tool-none">Not a standard size — call us, odd sizes are what we do.</span>`;
    return;
  }
  // Nearest on height first, so the closest real product leads.
  hits.sort((a, b) => Math.abs(a.height - depth) - Math.abs(b.height - depth));
  const m = hits[0];
  const w = m.widths.reduce((b, x) => Math.abs(x - width) < Math.abs(b - width) ? x : b, m.widths[0]);
  if (draw) draw.innerHTML = drawProfile(m.height, w, baseFromProfile(m.profile), { compact: true });
  const others = new Set(hits.map(x => `${x.range}|${x.colour}`)).size - 1;
  host.innerHTML = `
    <span class="sw ${esc(m.cls || '')}" aria-hidden="true"></span>
    <span class="tool-colour">${esc(m.colour)}</span>
    <span class="tool-size mono">${m.height.toFixed(2)} × ${w.toFixed(2)}mm</span>
    <span class="tool-range">${esc(m.range)}</span>
    ${others > 0 ? `<span class="tool-others">+${others} other${others === 1 ? '' : 's'}</span>` : ''}`;
}

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

  const suggested = board === 'recycled' ? 'Ultra-SR'
    : (caliper > 0.8 || board === 'solid') ? 'Phoenix XL' : 'Phoenix+';
  renderMatrixMatches(parseFloat(round(caliper * 0.9)),
                      parseFloat(round(caliper * 1.5 + rule)), suggested);
}

/* ---------------------------------------------------------------------
   BOOT
--------------------------------------------------------------------- */
/* Floor clips play only while they are on screen. preload="none" keeps them
   off the wire until then, so a visitor who never scrolls past the fold pays
   nothing for them — and a paused video off screen is wasted battery on a
   phone in a die shop. */
function initFloorClips() {
  /* The hero relies on the autoplay attribute alone, which browsers honour
     inconsistently — iOS in particular wants an explicit call, and a silent
     failure there is what left the hero as a flat navy block before. Asking
     for it directly, and swallowing the rejection, is the reliable way. */
  const hero = document.querySelector('.video-background-scaler video');
  if (hero) { hero.muted = true; hero.play().catch(() => {}); }

  const vids = [...document.querySelectorAll('.floor-video')];
  if (!vids.length) return;
  if (!('IntersectionObserver' in window)) { vids.forEach(v => v.play().catch(() => {})); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); }
      else v.pause();
    });
  }, { threshold: 0.35 });
  vids.forEach(v => io.observe(v));
}

window.addEventListener('DOMContentLoaded', async () => {
  initFloorClips();
  // Someone following an invitation or a reset link is landing on the site for
  // a specific reason, so they go to the hub rather than the home page.
  navigateTo(ARRIVED_FROM_EMAIL ? 'portal'
           : (window.location.hash.replace('#', '') || 'home'));
  renderQueue();
  loadLiveNews();

  ['heroCaliper', 'heroRule'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'heroCaliper' ? 'input' : 'change', heroFind);
  });
  heroFind();

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
  closeWelcome, replayWelcome, requestSamples,
  toggleThread, handlePostMessage, closeMobileNav,
  openAck, closeAck, printAck, downloadAck,
  handleInviteClient, loadSalesClients,
  handlePublishNews, handleNewsPdfPick,
  handleRangeChange, handleAddLineItemToQueue,
  removeQueuedItem, handlePlaceNewOrder, closeOrderModal, handleEnquiry,
  loadAccounts, setAccountStatus, handleLinkAccount,
});
