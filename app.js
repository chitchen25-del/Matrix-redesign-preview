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

   The staff admin console and the news publisher have been removed from the
   public site entirely. Creating client logins and publishing documents are
   staff jobs and belong in the production system behind proper accounts, not
   on a public web page behind a JavaScript string comparison.
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
  (target || document.getElementById('view-home')).classList.add('active-view');
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
   NEWS — public, read-only. Publishing happens in the factory system.
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
    grid.innerHTML = data.map(post => `
      <article class="news-card">
        <div class="news-card-img">
          <img src="${esc(post.image_url)}" alt="" loading="lazy">
          <span class="news-badge">${esc(post.category || 'Update')}</span>
        </div>
        <div class="news-card-content">
          <div>
            <div class="news-date">${esc(post.date_text || '')}</div>
            <h3>${esc(post.title || '')}</h3>
            ${post.content || ''}
          </div>
        </div>
      </article>`).join('');
  } catch (err) {
    grid.innerHTML = emptyNews('News could not be loaded. Please try again shortly.');
  }
}
function emptyNews(msg) {
  return `<div class="empty-state"><p>${esc(msg)}</p></div>`;
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
    document.getElementById('portalLoginGateway').style.display = 'none';
    document.getElementById('portalDashboard').style.display = 'none';
    document.getElementById('portalAdmin').style.display = 'block';
    await loadAccounts();
    return;
  }

  if (!who || !who.company) {
    document.getElementById('portalLoginError').textContent =
      'This account is not linked to a company yet. Contact us and we will set it up.';
    await sb.auth.signOut(); session = null; return;
  }
  myCompany = who.company;
  document.getElementById('currentClientTitle').textContent = myCompany;
  document.getElementById('newOrderCustomer').value = myCompany;
  document.getElementById('portalLoginGateway').style.display = 'none';
  document.getElementById('portalDashboard').style.display = 'block';

  const due = new Date();
  due.setDate(due.getDate() + 14);
  document.getElementById('newOrderDueDate').value = due.toISOString().split('T')[0];
  await fetchMyOrders();
}

async function handlePortalLogout() {
  if (sb) await sb.auth.signOut();
  session = null; myCompany = ''; isStaff = false; queuedLineItems = [];
  document.getElementById('portalDashboard').style.display = 'none';
  document.getElementById('portalAdmin').style.display = 'none';
  document.getElementById('portalLoginGateway').style.display = 'block';
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
      list.innerHTML = `
        <div class="empty-state">
          <h4>No orders on the system yet</h4>
          <p>When you place an order it will appear here, and update as it moves through production.</p>
          <button class="btn-solid-navy" onclick="switchPortalTab('new')">Place your first order</button>
        </div>`;
      return;
    }
    list.innerHTML = orders.map(renderOrderCard).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>Your orders could not be loaded. Please try again shortly.</p></div>`;
  }
}

// Stages mirror the factory system's own vocabulary so a customer sees the
// same words the shop floor does.
const STAGE_STEPS = ['Received', 'Manufacturing', 'Packing', 'Shipped'];
function renderOrderCard(ord) {
  const stage = ord.stage || 'Received';
  const idx = Math.max(0, STAGE_STEPS.findIndex(s =>
    stage.toLowerCase().startsWith(s.toLowerCase().slice(0, 4))));
  const lines = ord.line_items || [];
  const items = lines.reduce((t, li) => t + (Number(li.qty) || 0), 0);

  return `
    <article class="factory-order-card">
      <div class="factory-card-header">
        <div>
          <span class="wo-title-badge">${esc(ord.id)}</span>
          ${ord.reference ? `<span class="wo-ref">Your ref ${esc(ord.reference)}</span>` : ''}
        </div>
        <span class="stage-pill stage-step-${idx}">${esc(stage)}</span>
      </div>

      <ol class="stage-track" aria-label="Order progress">
        ${STAGE_STEPS.map((s, i) => `
          <li class="${i < idx ? 'passed' : i === idx ? 'current' : ''}">
            <span class="dot"></span><span class="lbl">${s}</span>
          </li>`).join('')}
      </ol>

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
  body.innerHTML = data.map(a => `
    <tr>
      <td><strong>${esc(a.company_name)}</strong></td>
      <td>${esc(a.contact_email || '—')}</td>
      <td>${a.linked ? '<span class="ok-tick">Signed up</span>' : '<span class="warn-txt">No login yet</span>'}</td>
      <td>${a.status === 'Active' ? '<span class="ok-tick">Active</span>' : '<span class="warn-txt">Revoked</span>'}</td>
      <td class="row-action">
        <button type="button" onclick="setAccountStatus(${a.id}, '${a.status === 'Active' ? 'Revoked' : 'Active'}')">
          ${a.status === 'Active' ? 'Revoke' : 'Restore'}
        </button>
      </td>
    </tr>`).join('');
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
  navigateTo(window.location.hash.replace('#', '') || 'home');
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
    if (data && data.session) { session = data.session; await enterPortal(); }
  }
});

Object.assign(window, {
  handlePortalLogin, handlePortalLogout, switchPortalTab,
  handleRangeChange, handleUnitTypeChange, handleAddLineItemToQueue,
  removeQueuedItem, handlePlaceNewOrder, closeOrderModal, handleEnquiry,
  loadAccounts, setAccountStatus, handleLinkAccount,
});
