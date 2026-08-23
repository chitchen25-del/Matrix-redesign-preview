// ==================== SUPABASE CLIENT INITIALIZATION ====================
const SUPABASE_URL = 'https://bjoneyilyyvoemeiojzl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZVnaPefnAgf4KfrBFkCmzw_3GfhiAnY';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let activeClientName = '';
let queuedLineItems = [];

// ==================== PRODUCT SPECS DATA ====================
const PRODUCT_SPECS_MAP = {
  'PX Plus': ['0.30 x 0.80', '0.30 x 1.00', '0.30 x 1.20', '0.40 x 1.00', '0.40 x 1.20', '0.40 x 1.30', '0.40 x 1.50', '0.50 x 1.30', '0.50 x 1.40', '0.50 x 1.50', '0.50 x 1.70', '0.60 x 1.50', '0.60 x 1.70', '0.60 x 1.90', '0.70 x 1.90', '0.80 x 2.10'],
  'Phoenix+': ['-- 7mm Mini Centre --', '0.30 x 0.80 (Pink)', '0.30 x 1.00 (Pink)', '0.30 x 1.20 (Pink)', '0.30 x 1.40 (Pink)', '0.40 x 1.00 (Navy)', '0.40 x 1.20 (Navy)', '0.40 x 1.30 (Navy)', '0.40 x 1.50 (Navy)', '0.45 x 1.30 (Lilac)', '0.45 x 1.40 (Lilac)', '0.45 x 1.50 (Lilac)', '0.50 x 1.30 (Red)', '0.50 x 1.40 (Red)', '0.50 x 1.50 (Red)', '0.50 x 1.70 (Red)', '0.55 x 1.40 (Grey)', '0.55 x 1.50 (Grey)', '0.55 x 1.70 (Grey)', '0.60 x 1.50 (Yellow)', '0.60 x 1.70 (Yellow)', '0.60 x 1.90 (Yellow)', '0.70 x 1.90 (Orange)', '0.70 x 2.10 (Orange)', '-- 7mm Off-Centre --', 'Off-Centre 0.30 x 1.00 (Pink)', 'Off-Centre 0.40 x 1.20 (Navy)', 'Off-Centre 0.50 x 1.50 (Red)', '-- 10mm Standard Centre --', '10mm 0.40 x 1.30 (Navy)', '10mm 0.50 x 1.50 (Red)', '10mm 0.60 x 1.70 (Yellow)', '10mm 0.80 x 2.10 (Green)'],
  'Ultra SR': ['-- 7mm Centre --', 'Mauve 0.38 x 0.5mm', 'Silver 0.38 x 0.8mm', 'Buff 0.38 x 1.0mm', 'Violet 0.38 x 1.2mm', 'White 0.45 x 1.3mm', 'Sky 0.45 x 1.4mm', 'Lime 0.45 x 1.5mm', 'Yellow 0.50 x 1.6mm', 'Rose 0.50 x 1.7mm', 'Slate 0.55 x 1.9mm', 'Green 0.60 x 2.0mm', 'Brown 0.60 x 2.1mm', 'Red 0.70 x 2.3mm', 'Black 0.70 x 2.4mm', 'Blue 0.80 x 2.6mm', 'Orange 0.90 x 3.0mm', '-- 7mm Off-Centre --', 'Off-Centre Silver 0.38 x 0.8mm', 'Off-Centre Buff 0.38 x 1.0mm', 'Off-Centre Violet 0.38 x 1.2mm', 'Off-Centre White 0.45 x 1.3mm', 'Off-Centre Sky 0.45 x 1.4mm', 'Off-Centre Lime 0.45 x 1.5mm', 'Off-Centre Yellow 0.50 x 1.6mm', 'Off-Centre Rose 0.50 x 1.7mm', '-- 12mm Centre --', 'Grey 1.30mm (3.80)', 'Black 1.50mm (5.00)', 'Cream 1.70mm (6.00)', '-- 12mm Double --', 'Buff 0.38mm D3/D4/D5', 'White 0.45mm D3/D4/D5', 'Yellow 0.50mm D3/D4/D5'],
  'Phoenix XL': ['-- 12mm Standard Base --', '0.40 x 1.30 (Navy)', '0.40 x 1.40 (Navy)', '0.40 x 1.50 (Navy)', '0.40 x 1.60 (Navy)', '0.40 x 1.70 (Navy)', '0.50 x 1.30 (Red)', '0.50 x 1.40 (Red)', '0.50 x 1.50 (Red)', '0.50 x 1.60 (Red)', '0.50 x 1.70 (Red)', '0.50 x 1.90 (Red)', '0.60 x 1.50 (Yellow)', '0.60 x 1.70 (Yellow)', '0.60 x 1.90 (Yellow)', '0.60 x 2.10 (Yellow)', '0.60 x 2.30 (Yellow)', '0.60 x 2.50 (Yellow)', '0.60 x 2.70 (Yellow)', '0.60 x 3.00 (Yellow)', '0.60 x 3.20 (Yellow)', '0.70 x 2.10 (Orange)', '0.70 x 2.30 (Orange)', '0.70 x 2.50 (Orange)', '0.70 x 2.70 (Orange)', '0.70 x 3.00 (Orange)', '0.70 x 3.20 (Orange)', '0.80 x 2.10 (Green)', '0.80 x 2.30 (Green)', '0.80 x 2.50 (Green)', '0.80 x 2.70 (Green)', '0.80 x 3.00 (Green)', '0.80 x 3.20 (Green)', '1.00 x 2.10 (Sky)', '1.00 x 2.30 (Sky)', '1.00 x 2.50 (Sky)', '1.00 x 2.70 (Sky)', '1.00 x 3.00 (Sky)', '1.00 x 3.20 (Sky)', '-- 15mm Extra-Wide Base --', '0.60 x 3.50 (Yellow)', '0.60 x 4.00 (Yellow)', '0.60 x 4.50 (Yellow)', '0.60 x 5.00 (Yellow)', '0.70 x 3.50 (Orange)', '0.70 x 4.00 (Orange)', '0.70 x 4.50 (Orange)', '0.70 x 5.00 (Orange)', '0.80 x 3.50 (Green)', '0.80 x 4.00 (Green)', '0.80 x 4.50 (Green)', '0.80 x 5.00 (Green)', '1.00 x 3.50 (Sky)', '1.00 x 4.00 (Sky)', '1.00 x 4.50 (Sky)', '1.00 x 5.00 (Sky)'],
  'Exceed': ['-- 5.00mm Base Width --', '7.00 x 5.00 (White)', '7.25 x 5.00 (White)', '-- 7.50mm Base Width --', '7.00 x 7.50 (White)', '7.25 x 7.50 (White)'],
  'Smart Formes': ['0.40 x 1.30', '0.40 x 1.50', '0.50 x 1.50', '0.50 x 1.70', '0.60 x 1.70', '0.60 x 1.90', '0.70 x 1.90']
};

const LENGTHS_MAP = {
  'Box': ['24m', '21m', '20.25m', '18m', '15m', '36m', '50m', '34m', '60m'],
  'Reel': ['36m', '45m', '60m']
};

// ==================== UI STATE LOGIC ====================
function handleUnitTypeChange() {
  const unitType = document.getElementById('lineUnitType').value;
  const metersSelect = document.getElementById('lineMeters');
  const lengths = LENGTHS_MAP[unitType] || LENGTHS_MAP['Box'];
  metersSelect.innerHTML = lengths.map(len => `<option value="${len}">${len}</option>`).join('');
  metersSelect.value = (unitType === 'Box') ? '24m' : '36m';
}

function handleRangeChange() {
  const range = document.getElementById('lineRange').value;
  const sizeSelect = document.getElementById('lineSizeSelect');
  const specs = PRODUCT_SPECS_MAP[range] || PRODUCT_SPECS_MAP['PX Plus'];
  
  if (['Ultra SR', 'Phoenix XL', 'Phoenix+', 'Exceed'].includes(range)) {
    sizeSelect.innerHTML = specs.map(s => {
      if (s.startsWith('--')) return `<option disabled>${s}</option>`;
      return `<option value="${s}">${s}</option>`;
    }).join('');
    
    if (range === 'Ultra SR') sizeSelect.value = 'Mauve 0.38 x 0.5mm';
    else if (range === 'Phoenix XL') sizeSelect.value = '0.40 x 1.30 (Navy)';
    else if (range === 'Phoenix+') sizeSelect.value = '0.30 x 0.80 (Pink)';
    else if (range === 'Exceed') sizeSelect.value = '7.00 x 5.00 (White)';
  } else {
    sizeSelect.innerHTML = specs.map(s => `<option value="${s}">${s}${s.includes('Custom') || s.includes('Strip') ? '' : ' mm'}</option>`).join('');
  }
  handleSizeSpecChange();
}

function handleSizeSpecChange() {
  const range = document.getElementById('lineRange').value;
  const size = document.getElementById('lineSizeSelect').value;
  const ptSelect = document.getElementById('linePt');
  
  if (range === 'Ultra SR') {
    if (size.includes('Orange')) ptSelect.value = '3 / 4 pt'; else ptSelect.value = '2 / 3 pt';
  } else if (range === 'Exceed') { 
    ptSelect.value = 'Profile Strip';
  } else if (range === 'Phoenix XL') {
    if (size.includes('15mm') || size.includes('3.50') || size.includes('4.00') || size.includes('5.00')) ptSelect.value = '3 / 4 pt'; else ptSelect.value = '2 / 3 pt';
  } else {
    if (ptSelect.value === 'Profile Strip') ptSelect.value = '2 / 3 pt';
  }
}

// ==================== NAVIGATION ROUTER ====================
const menuToggle = document.getElementById('menuToggle');
const siteNav = document.getElementById('siteNav');

menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  siteNav.classList.toggle('mobile-active');
});

function navigateTo(pageId) {
  menuToggle.classList.remove('open');
  siteNav.classList.remove('mobile-active');
  
  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active-view'));
  const targetView = document.getElementById(`view-${pageId}`);
  if (targetView) targetView.classList.add('active-view');
  
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`nav-${pageId}`);
  if (targetBtn) targetBtn.classList.add('active');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.pushState(null, '', `#${pageId}`);
}

window.addEventListener('popstate', () => { navigateTo(window.location.hash.replace('#', '') || 'home'); });
window.addEventListener('DOMContentLoaded', () => { 
  navigateTo(window.location.hash.replace('#', '') || 'home'); 
  handleRangeChange(); 
  handleUnitTypeChange(); 
  loadLiveNews(); 
});

// ==================== LIVE NEWS PUBLISHER ====================
async function loadLiveNews() {
  const grid = document.getElementById('liveNewsGrid');
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('news_posts').select('*').order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      grid.innerHTML = data.map(post => `
        <article class="news-card">
          <div class="news-card-img">
            <img src="${post.image_url || 'https://www.coexpan.com/wp-content/uploads/2025/05/DSC0476.webp'}" alt="News Image">
            <span class="news-badge" style="background:var(--matrix-navy);">${post.category}</span>
          </div>
          <div class="news-card-content">
            <div>
              <div class="news-date">${post.date_text}</div>
              <h3>${post.title}</h3>
              <p style="white-space: pre-wrap;">${post.content}</p>
              ${post.pdf_url ? `<a href="${post.pdf_url}" target="_blank" class="btn-outline-navy" style="width: 100%; min-height: 40px; font-size: 0.85rem; margin-top: 1rem;">Download Attached PDF</a>` : ''}
            </div>
          </div>
        </article>
      `).join('');
    }
  } catch (err) {
    console.warn("News logic not deployed on remote yet");
  }
}

async function handlePublishNews(e) {
  e.preventDefault();
  const title = document.getElementById('newsTitle').value;
  const date = document.getElementById('newsDate').value;
  const cat = document.getElementById('newsCategory').value;
  const img = document.getElementById('newsImage').value;
  const content = document.getElementById('newsContent').value;
  const fileInput = document.getElementById('newsPdfFile');
  
  let pdfUrl = null;

  if (supabaseClient) {
    try {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Publishing...';
      submitBtn.disabled = true;

      if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `news-${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('NEWS-PDFS')
          .upload(`news-files/${fileName}`, file);
          
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabaseClient.storage
          .from('NEWS-PDFS')
          .getPublicUrl(`news-files/${fileName}`);
          
        pdfUrl = publicUrlData.publicUrl;
      }

      const { error: dbError } = await supabaseClient.from('news_posts').insert([{ 
        title: title, 
        date_text: date, 
        category: cat, 
        image_url: img, 
        content: content,
        pdf_url: pdfUrl 
      }]);
      
      if (dbError) throw dbError;

      alert('News Published Successfully!'); 
      e.target.reset(); 
      loadLiveNews();
      
    } catch(err) { 
      alert('Failed to publish: ' + err.message); 
    } finally {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Publish Post to Website';
      submitBtn.disabled = false;
    }
  } else {
    alert('Database connection is currently offline.');
  }
}

// ==================== CLIENT PORTAL AUTH & ORDERS ====================
async function handlePortalLogin(e) {
  e.preventDefault();
  const user = document.getElementById('portalUser').value.trim();
  const pass = document.getElementById('portalPass').value.trim();
  if (!user || !pass) return;

  if (supabaseClient) {
    try {
      const { data: userRec, error } = await supabaseClient.from('portal_users').select('*').ilike('company_name', user).eq('access_pin', pass).eq('status', 'Active').limit(1);
      if (!error && userRec && userRec.length > 0) { 
        loginSuccess(userRec[0].company_name); 
        return; 
      }
    } catch (err) {}
  }
  
  if ((user.toLowerCase().includes('jkk') && pass === 'MX2026') || (user.toLowerCase().includes('sim') && pass === 'MX2026') || (user.toLowerCase() === 'test' && pass === 'test')) { 
    loginSuccess(user); 
  } else { 
    alert('Authentication Failed. Check Company Name and Access PIN.'); 
  }
}

function loginSuccess(companyName) {
  activeClientName = companyName; 
  document.getElementById('currentClientTitle').textContent = companyName; 
  document.getElementById('newOrderCustomer').value = companyName;
  document.getElementById('portalLoginGateway').style.display = 'none'; 
  document.getElementById('portalDashboard').style.display = 'block';
  
  const defaultDue = new Date(); 
  defaultDue.setDate(defaultDue.getDate() + 7); 
  document.getElementById('newOrderDueDate').value = defaultDue.toISOString().split('T')[0];
  fetchClientOrdersFromSupabase();
}

function handlePortalLogout() {
  activeClientName = ''; 
  document.getElementById('portalDashboard').style.display = 'none'; 
  document.getElementById('portalLoginGateway').style.display = 'block';
  document.getElementById('portalUser').value = ''; 
  document.getElementById('portalPass').value = '';
}

function switchPortalTab(tab) {
  if (tab === 'active') {
    document.getElementById('tabBtnActive').classList.add('active-tab'); 
    document.getElementById('tabBtnNew').classList.remove('active-tab');
    document.getElementById('tabContentActive').style.display = 'block'; 
    document.getElementById('tabContentNew').style.display = 'none'; 
    fetchClientOrdersFromSupabase();
  } else {
    document.getElementById('tabBtnNew').classList.add('active-tab'); 
    document.getElementById('tabBtnActive').classList.remove('active-tab');
    document.getElementById('tabContentNew').style.display = 'block'; 
    document.getElementById('tabContentActive').style.display = 'none';
  }
}

async function fetchClientOrdersFromSupabase() {
  const listContainer = document.getElementById('activeOrdersList');
  listContainer.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);">Loading production records...</div>`;
  try {
    if (!supabaseClient) throw new Error('Supabase client not loaded');
    const { data: orders, error } = await supabaseClient.from('orders').select('*, line_items(*)').ilike('customer', `%${activeClientName}%`).eq('deleted', false).order('order_date', { ascending: false });
    if (error) throw error;
    
    if (!orders || orders.length === 0) {
      listContainer.innerHTML = `
        <div style="background:var(--bg-light);border:1.5px dashed var(--border-medium);border-radius:var(--radius-md);padding:2.5rem;text-align:center;">
          <h4 style="color:var(--matrix-navy);font-size:1.1rem;margin-bottom:0.5rem;">No Active Production Runs</h4>
          <button class="btn-solid-navy" onclick="switchPortalTab('new')">+ Place New Production Order</button>
        </div>`;
      return;
    }
    
    let html = '';
    orders.forEach(ord => {
      const stage = ord.stage || 'Received'; 
      let stageClass = 'stage-received'; 
      let progressClass = 'fill-received';
      
      if (stage.toUpperCase().includes('EXTRU') || stage.toUpperCase().includes('BOND') || stage.toUpperCase().includes('MILL') || stage.toUpperCase().includes('PROD')) { 
        stageClass = 'stage-production'; 
        progressClass = 'fill-production'; 
      }
      if (stage.toUpperCase().includes('SHIP') || stage.toUpperCase().includes('DISPATCH')) { 
        stageClass = 'stage-shipped'; 
        progressClass = 'fill-shipped'; 
      }
      
      const itemsCount = ord.line_items ? ord.line_items.length : 0; 
      let totalBoxes = 0;
      if (ord.line_items) { ord.line_items.forEach(li => { totalBoxes += (parseFloat(li.qty) || 0); }); }
      
      html += `
        <div class="factory-order-card">
          <div class="factory-card-header">
            <div>
              <span class="wo-title-badge">${ord.id || ord.reference || 'WO-0000'}</span>
              <span style="color:var(--text-muted);font-size:0.88rem;margin-left:0.5rem;">${ord.customer || activeClientName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span class="stage-pill ${stageClass}">${stage}</span>
              <span style="font-size:0.85rem;color:var(--text-dim);font-weight:700;font-family:var(--font-mono);">${itemsCount} lines • ${totalBoxes} boxes</span>
            </div>
          </div>
          <div class="job-progress-track">
            <div class="job-progress-fill ${progressClass}"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;font-size:0.85rem;margin-bottom:1rem;">
            <div><span style="color:var(--text-dim);font-weight:700;">Order Date:</span> <strong>${ord.order_date || 'In Queue'}</strong></div>
            <div><span style="color:var(--text-dim);font-weight:700;">Requested Due:</span> <strong>${ord.due_date || 'Standard'}</strong></div>
            <div><span style="color:var(--text-dim);font-weight:700;">Shipping Ref:</span> <strong>${ord.shipped_date ? 'Dispatched ' + ord.shipped_date : 'Awaiting Freight'}</strong></div>
          </div>
          ${ord.line_items && ord.line_items.length > 0 ? `
            <table class="line-items-preview-table">
              <thead><tr><th>Product Description</th><th>Quantity (Boxes/Units)</th><th>Status</th></tr></thead>
              <tbody>
                ${ord.line_items.map(li => `
                  <tr>
                    <td><strong>${li.description || 'Matrix Profile'}</strong></td>
                    <td style="font-family:var(--font-mono);font-weight:800;">${li.qty} Boxes</td>
                    <td><span style="color:var(--matrix-green);font-weight:700;">● Production Tracked</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          ` : '<p style="font-size:0.85rem;color:var(--text-dim);">Specifications logged in workshop tracker.</p>'}
        </div>`;
    });
    listContainer.innerHTML = html;
  } catch (err) {}
}

function handleAddLineItemToQueue() {
  const range = document.getElementById('lineRange').value;
  const size = document.getElementById('lineSizeSelect').value;
  const pt = document.getElementById('linePt').value;
  const unitType = document.getElementById('lineUnitType').value;
  const meters = document.getElementById('lineMeters').value;
  const qty = parseInt(document.getElementById('lineQty').value, 10);
  
  if (!size || size.startsWith('--')) { alert('Please select a valid specification.'); return; }
  if (isNaN(qty) || qty < 10) { alert('Minimum order quantity is 10 boxes per specification.'); return; }
  
  const itemDesc = (['Ultra SR','Phoenix XL','Phoenix+','Exceed'].includes(range)) ? `${range} ${size} (${pt}) - ${meters} ${unitType}` : `${range} ${size} mm (${pt}) - ${meters} ${unitType}`;
  queuedLineItems.push({ description: itemDesc, range: range, size: size, pt: pt, unitType: unitType, meters: meters, qty: qty });
  
  renderQueuedLineItems(); 
  document.getElementById('lineQty').value = '10';
}

function removeQueuedItem(index) { 
  queuedLineItems.splice(index, 1); 
  renderQueuedLineItems(); 
}

function renderQueuedLineItems() {
  const tbody = document.getElementById('lineItemsTableBody');
  if (queuedLineItems.length === 0) { 
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1rem;">No lines added yet. Configure above and click '+ Add Line'.</td></tr>`; 
    return; 
  }
  
  tbody.innerHTML = queuedLineItems.map((item, idx) => {
    let flashClass = (idx === queuedLineItems.length - 1) ? 'row-flash' : '';
    return `
      <tr class="${flashClass}">
        <td><strong>${item.range} ${item.size}</strong></td>
        <td>${item.pt}</td>
        <td>${item.meters} / ${item.unitType}</td>
        <td style="font-family:var(--font-mono);font-weight:800;color:var(--matrix-navy);">${item.qty} Boxes</td>
        <td style="text-align:right;"><button type="button" onclick="removeQueuedItem(${idx})" style="color:var(--matrix-red);border:none;background:none;font-weight:800;cursor:pointer;">Remove</button></td>
      </tr>`;
  }).join('');
}

async function handlePlaceNewOrder(e) {
  e.preventDefault();
  if (queuedLineItems.length === 0) { alert('Please add at least one product line item.'); return; }
  
  const customer = activeClientName;
  const ref = document.getElementById('newOrderRef').value.trim();
  const dueDate = document.getElementById('newOrderDueDate').value;
  const address = document.getElementById('newOrderAddress').value.trim();
  const notes = document.getElementById('newOrderNotes').value.trim();
  const orderDate = new Date().toISOString().split('T')[0];
  const woGeneratedId = 'WO-' + Math.floor(1000 + Math.random() * 9000);
  
  if (supabaseClient) {
    try {
      const { data: newOrder, error: orderErr } = await supabaseClient.from('orders').insert([{ id: woGeneratedId, customer: customer, reference: ref, order_date: orderDate, due_date: dueDate, address: address, notes: notes, stage: 'Received', currency: 'GBP', priority: 0, deleted: false }]).select();
      if (orderErr) { alert('Database write failed: ' + orderErr.message); return; }
      if (newOrder && newOrder[0]) {
        const linesToInsert = queuedLineItems.map((item, index) => ({ id: `${woGeneratedId}-L${index + 1}`, order_id: woGeneratedId, description: item.description, qty: Number(item.qty), unit_price: 0, from_other_stock: 0, deleted: false }));
        await supabaseClient.from('line_items').insert(linesToInsert);
      }
    } catch (err) { alert('Network/Database error: ' + err.message); return; }
  }
  
  const emailSubject = `New Production Order: ${woGeneratedId} - ${customer}`;
  const lineSummaryText = queuedLineItems.map(i => `  • ${i.description} | Quantity: ${i.qty} Boxes`).join('\n');
  const emailBodyRaw = `NEW ORDER GENERATED VIA CLIENT PORTAL\n--------------------------------------------------\nWork Order ID : ${woGeneratedId}\nCustomer      : ${customer}\nPO Reference  : ${ref}\nOrder Date    : ${orderDate}\nDue Date      : ${dueDate}\nDelivery Bay  : ${address || 'Standard Plant Address'}\n\nPRODUCT LINE SPECIFICATIONS:\n${lineSummaryText}\n\nCUSTOMER NOTES:\n${notes || 'No special instructions provided.'}\n--------------------------------------------------`;
  const hiddenLink = document.createElement('a'); 
  hiddenLink.href = `mailto:sales@creasingmatrix.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBodyRaw)}`; 
  hiddenLink.style.display = 'none'; 
  document.body.appendChild(hiddenLink); 
  hiddenLink.click(); 
  document.body.removeChild(hiddenLink);
  
  queuedLineItems = []; 
  renderQueuedLineItems(); 
  document.getElementById('newOrderRef').value = ''; 
  document.getElementById('newOrderAddress').value = ''; 
  document.getElementById('newOrderNotes').value = ''; 
  document.getElementById('orderConfirmationModal').style.display = 'flex';
}

function closeOrderModal() { document.getElementById('orderConfirmationModal').style.display = 'none'; switchPortalTab('active'); }
function openRequestAccessModal() { document.getElementById('requestAccessModal').style.display = 'flex'; }
function closeRequestAccessModal() { document.getElementById('requestAccessModal').style.display = 'none'; }

async function handleSubmitAccessRequest(e) {
  e.preventDefault(); 
  const comp = document.getElementById('reqCompany').value.trim();
  const email = document.getElementById('reqEmail').value.trim();
  const ref = document.getElementById('reqRef').value.trim();
  
  if (supabaseClient) { 
    try { await supabaseClient.from('portal_users').insert([{ company_name: comp, contact_email: email, access_pin: 'PENDING', status: 'Pending' }]); } catch (err) {} 
  }
  
  const subject = `Client Portal Access Request: ${comp}`; 
  const body = `A customer has requested login access to the Matrix Engineering Client Hub:\n\nCompany Name       : ${comp}\nContact Email      : ${email}\nVerification Ref/PO: ${ref || 'None provided'}`;
  window.location.href = `mailto:sales@creasingmatrix.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; 
  closeRequestAccessModal(); 
  alert('Thank you! Your request has been logged.');
}

// ==================== ADMIN SYSTEM ====================
function openAdminLoginModal() { document.getElementById('adminLoginModal').style.display = 'flex'; }
function closeAdminLoginModal() { document.getElementById('adminLoginModal').style.display = 'none'; document.getElementById('adminMasterPass').value = ''; }

function handleVerifyAdminPass(e) {
  e.preventDefault(); 
  const pass = document.getElementById('adminMasterPass').value.trim();
  if (pass.toLowerCase() === 'buster26') { 
    closeAdminLoginModal(); 
    document.getElementById('portalLoginGateway').style.display = 'none'; 
    document.getElementById('portalDashboard').style.display = 'none'; 
    document.getElementById('portalAdminConsole').style.display = 'block'; 
    loadAdminPortalUsers(); 
  } else { 
    alert('Access Denied.'); 
  }
}

function closeAdminConsole() { document.getElementById('portalAdminConsole').style.display = 'none'; document.getElementById('portalLoginGateway').style.display = 'block'; }

async function loadAdminPortalUsers() {
  const tbody = document.getElementById('adminUserTableBody'); 
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 1rem;">Loading user database...</td></tr>`;
  
  if (supabaseClient) {
    try {
      const { data: users, error } = await supabaseClient.from('portal_users').select('*').order('created_at', { ascending: false });
      if (!error && users && users.length > 0) { 
        tbody.innerHTML = users.map(u => `
          <tr>
            <td><strong>${u.company_name}</strong></td>
            <td>${u.contact_email}</td>
            <td><code style="font-family: var(--font-mono); font-weight: 800; color: var(--matrix-red);">${u.access_pin}</code></td>
            <td><span style="font-weight: 800; color: ${u.status === 'Active' ? 'var(--matrix-green)' : 'var(--matrix-red)'};">● ${u.status}</span></td>
            <td>
              ${u.status === 'Pending' 
                ? `<button class="btn-solid-navy" style="min-height: 28px; padding: 2px 8px; font-size: 0.75rem;" onclick="handleAdminApprove('${u.id}', '${u.company_name}')">Approve PIN</button>` 
                : `<button style="border: 1px solid var(--border-medium); background: none; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700; padding: 2px 6px; cursor: pointer;" onclick="handleAdminRevoke('${u.id}')">Revoke</button>`}
            </td>
          </tr>`).join(''); 
        return; 
      }
    } catch (err) {}
  }
  tbody.innerHTML = `<tr><td><strong>JKK Development & Solutions CC</strong></td><td>purchasing@jkkdev.com</td><td><code>MX2026</code></td><td><span style="color:var(--matrix-green); font-weight:800;">● Active</span></td><td>-</td></tr>`;
}

async function handleAdminCreateUser(e) { 
  e.preventDefault(); 
  const comp = document.getElementById('adminNewCompany').value.trim(); 
  const email = document.getElementById('adminNewEmail').value.trim(); 
  const pin = document.getElementById('adminNewPIN').value.trim(); 
  
  if (supabaseClient) { 
    try { 
      await supabaseClient.from('portal_users').insert([{ company_name: comp, contact_email: email, access_pin: pin, status: 'Active' }]); 
      alert(`Success.`); 
      document.getElementById('adminNewCompany').value = ''; 
      document.getElementById('adminNewEmail').value = ''; 
      loadAdminPortalUsers(); 
    } catch (err) {} 
  } 
}

async function handleAdminApprove(id, comp) { 
  const pin = prompt(`Enter Access PIN to assign for ${comp}:`, 'MX2026'); 
  if (!pin) return; 
  if (supabaseClient) { 
    try { 
      await supabaseClient.from('portal_users').update({ access_pin: pin, status: 'Active' }).eq('id', id); 
      loadAdminPortalUsers(); 
    } catch (err) {} 
  } 
}

async function handleAdminRevoke(id) { 
  if (!confirm('Revoke access for this client?')) return; 
  if (supabaseClient) { 
    try { 
      await supabaseClient.from('portal_users').update({ status: 'Revoked' }).eq('id', id); 
      loadAdminPortalUsers(); 
    } catch (err) {} 
  } 
}

// ==================== LIVE CALCULATOR ====================
const caliperInput = document.getElementById('boardCaliper');
const caliperVal = document.getElementById('caliperVal');
const ruleInput = document.getElementById('creasingRule');
const boardType = document.getElementById('boardType');
const resDepth = document.getElementById('resDepth');
const resWidth = document.getElementById('resWidth');
const resProduct = document.getElementById('resProduct');

function calculateMatrix() {
  const caliper = parseFloat(caliperInput.value) || 0;
  const rule = parseFloat(ruleInput.value) || 0;
  const bType = boardType.value;
  
  caliperVal.textContent = `${caliper.toFixed(2)} mm`;
  
  if (caliper > 0 && rule > 0) {
    resDepth.textContent = (Math.round((caliper * 0.9) * 20) / 20).toFixed(2); 
    resWidth.textContent = (Math.round(((caliper * 1.5) + rule) * 20) / 20).toFixed(2);
    
    if (bType === 'recycled') resProduct.textContent = 'ULTRA-SR™ (Polyester Base)'; 
    else if (caliper > 0.8 || bType === 'solid') resProduct.textContent = 'PHOENIX XL™ (Wide Base)'; 
    else resProduct.textContent = 'PHOENIX+™ (Polymer Base)';
  }
}

caliperInput.addEventListener('input', calculateMatrix); 
ruleInput.addEventListener('change', calculateMatrix); 
boardType.addEventListener('change', calculateMatrix); 
calculateMatrix();
