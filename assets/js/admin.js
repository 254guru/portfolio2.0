'use strict';

// ── Security ──────────────────────────────────────────────────────────────────
var PASSPHRASE_HASH = 'bfeef40817b856c26f72726c841168f09ec41e49c1eedae16ab85298e1010a7f';
var MAX_ATTEMPTS    = 5;
var LOCKOUT_MS      = 60 * 1000;
var SESSION_MS      = 30 * 60 * 1000;
var SESSION_KEY     = 'adm_sess';
var LOCKOUT_KEY     = 'adm_lk';

// ── SHA-256 ───────────────────────────────────────────────────────────────────
async function sha256(text) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(function(b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

// ── Lockout helpers ───────────────────────────────────────────────────────────
function getLockout() {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) || {attempts:0, until:0}; }
  catch(e) { return {attempts:0, until:0}; }
}
function saveLockout(s) { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(s)); }
function clearLockout() { localStorage.removeItem(LOCKOUT_KEY); }

// ── Session helpers ───────────────────────────────────────────────────────────
var _sessionTimer = null;
var _sessionDisplayInterval = null;

function sessionIsValid() {
  var ts = sessionStorage.getItem(SESSION_KEY);
  return ts && (Date.now() - parseInt(ts, 10)) < SESSION_MS;
}
function touchSession() { sessionStorage.setItem(SESSION_KEY, Date.now().toString()); }
function startSession() {
  touchSession();
  _resetSessionTimer();
  ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(function(ev) {
    document.addEventListener(ev, _onActivity, {passive: true});
  });
  _sessionDisplayInterval = setInterval(_updateSessionTimer, 1000);
  _updateSessionTimer();
}
function _onActivity() { touchSession(); _resetSessionTimer(); }
function _resetSessionTimer() {
  clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(function() { logout('Session expired due to inactivity.'); }, SESSION_MS);
}
function _updateSessionTimer() {
  var elTimer = document.getElementById('session-timer');
  if (!elTimer) return;
  var ts = sessionStorage.getItem(SESSION_KEY);
  if (!ts) { elTimer.textContent = ''; return; }
  var rem = SESSION_MS - (Date.now() - parseInt(ts, 10));
  if (rem <= 0) { elTimer.textContent = ''; return; }
  var m = Math.floor(rem / 60000);
  var s = Math.floor((rem % 60000) / 1000);
  elTimer.textContent = 'Session: ' + m + ':' + (s < 10 ? '0' : '') + s;
}
function logout(msg) {
  clearTimeout(_sessionTimer);
  clearInterval(_sessionDisplayInterval);
  sessionStorage.removeItem(SESSION_KEY);
  ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(function(ev) {
    document.removeEventListener(ev, _onActivity);
  });
  _showLogin(msg || '');
}

// ── Login overlay UI ──────────────────────────────────────────────────────────
var _lockoutInterval = null;

function _showLogin(message) {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('main-content').style.display  = 'none';
  document.getElementById('passphrase-input').value = '';
  var errEl = document.getElementById('login-error');
  errEl.textContent = message;
  errEl.style.display = message ? 'block' : 'none';
  _renderDots();
  _checkLockoutUI();
}
function _hideLogin() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('main-content').style.display  = 'flex';
}
function _renderDots() {
  var state = getLockout();
  var html = '';
  for (var i = 0; i < MAX_ATTEMPTS; i++) {
    html += '<span class="attempt-dot' + (i < state.attempts ? ' used' : '') + '"></span>';
  }
  document.getElementById('attempt-dots').innerHTML = html;
}
function _checkLockoutUI() {
  var state = getLockout();
  if (state.until && Date.now() < state.until) { _startLockoutUI(state.until); return true; }
  _enableLoginForm(true);
  return false;
}
function _enableLoginForm(enabled) {
  document.getElementById('passphrase-input').disabled = !enabled;
  document.getElementById('login-submit').disabled     = !enabled;
  if (enabled) document.getElementById('passphrase-input').focus();
}
function _startLockoutUI(until) {
  _enableLoginForm(false);
  var countEl = document.getElementById('lockout-countdown');
  clearInterval(_lockoutInterval);
  _lockoutInterval = setInterval(function() {
    var rem = Math.ceil((until - Date.now()) / 1000);
    if (rem <= 0) {
      clearInterval(_lockoutInterval);
      var st = getLockout(); st.attempts = 0; st.until = 0; saveLockout(st);
      _enableLoginForm(true);
      countEl.style.display = 'none';
      document.getElementById('login-error').style.display = 'none';
      _renderDots();
    } else {
      countEl.textContent   = 'Too many attempts. Try again in ' + rem + 's';
      countEl.style.display = 'block';
    }
  }, 1000);
}
async function attemptLogin() {
  var state = getLockout();
  if (state.until && Date.now() < state.until) return;
  var passphrase = document.getElementById('passphrase-input').value;
  if (!passphrase) return;
  var hash = await sha256(passphrase);
  if (hash === PASSPHRASE_HASH) {
    clearLockout();
    clearInterval(_lockoutInterval);
    document.getElementById('lockout-countdown').style.display = 'none';
    _hideLogin();
    startSession();
    loadData();
  } else {
    state.attempts = (state.attempts || 0) + 1;
    if (state.attempts >= MAX_ATTEMPTS) state.until = Date.now() + LOCKOUT_MS;
    saveLockout(state);
    _renderDots();
    if (state.until && Date.now() < state.until) {
      _startLockoutUI(state.until);
    } else {
      var rem = MAX_ATTEMPTS - state.attempts;
      var errEl = document.getElementById('login-error');
      errEl.textContent   = 'Incorrect passphrase. ' + rem + ' attempt' + (rem === 1 ? '' : 's') + ' remaining.';
      errEl.style.display = 'block';
      document.getElementById('passphrase-input').value = '';
      document.getElementById('passphrase-input').focus();
    }
  }
}

// Expose for any legacy inline handlers still present
window.attemptLogin = attemptLogin;

// Bind login events in JS (preferred)
(function bindLoginEvents() {
  var input = document.getElementById('passphrase-input');
  var btn = document.getElementById('login-submit');

  if (input) {
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        attemptLogin();
      }
    });
  }

  if (btn) {
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      attemptLogin();
    });
  }
}());

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(function init() {
  if (sessionIsValid()) {
    _hideLogin();
    startSession();
    setTimeout(function() { loadData(); }, 0);
  } else {
    _showLogin('');
  }
}());

// ── Data ──────────────────────────────────────────────────────────────────────
var portfolioData = null;

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll('#nav-links a').forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    var sec = this.dataset.section;
    document.querySelectorAll('#nav-links a, #bottom-nav a').forEach(function(a) { a.classList.remove('active'); });
    document.querySelectorAll('#nav-links a[data-section="' + sec + '"], #bottom-nav a[data-section="' + sec + '"]').forEach(function(a) { a.classList.add('active'); });
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
    var target = document.getElementById('section-' + sec);
    if (target) target.classList.add('active');
    // close sidebar on mobile
    var sidebar  = document.querySelector('nav.sidebar');
    var overlay  = document.getElementById('sidebar-overlay');
    if (sidebar)  sidebar.classList.remove('open');
    if (overlay)  overlay.classList.remove('active');
  });
});

// ── Bottom nav (mobile) ───────────────────────────────────────────────────────
(function setupBottomNav() {
  var sidebarLinks = document.getElementById('nav-links');
  var bottomNav    = document.getElementById('bottom-nav');
  if (!sidebarLinks || !bottomNav) return;

  var iconMap = {
    'about':          'person-outline',
    'services-about': 'construct-outline',
    'education':      'school-outline',
    'experience':     'briefcase-outline',
    'skills':         'bar-chart-outline',
    'services-page':  'layers-outline',
    'projects':       'apps-outline',
    'blog':           'newspaper-outline'
  };

  var inner = document.createElement('div');
  inner.className = 'nav-inner';

  Array.from(sidebarLinks.querySelectorAll('a')).forEach(function(a) {
    var sec   = a.dataset.section;
    var label = (a.textContent || sec || '').trim();
    var icon  = iconMap[sec] || 'ellipse-outline';
    var link  = document.createElement('a');
    link.href = '#';
    link.setAttribute('data-section', sec);
    link.setAttribute('title', label);
    link.setAttribute('aria-label', label);
    link.innerHTML = '<ion-icon name="' + icon + '" aria-hidden="true"></ion-icon><span class="sr">' + label + '</span>';
    if (a.classList.contains('active')) link.classList.add('active');
    link.addEventListener('click', function(e) {
      e.preventDefault();
      document.querySelectorAll('#nav-links a, #bottom-nav a').forEach(function(x) { x.classList.remove('active'); });
      document.querySelectorAll('[data-section="' + sec + '"]').forEach(function(x) { x.classList.add('active'); });
      document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
      var target = document.getElementById('section-' + sec);
      if (target) target.classList.add('active');
      window.scrollTo({top: 0, behavior: 'smooth'});
    });
    inner.appendChild(link);
  });

  bottomNav.appendChild(inner);
})();

// ── Header hamburger + sidebar toggle ─────────────────────────────────────────
(function setupHeaderMenu() {
  var btn  = document.getElementById('actions-hamburger');
  var menu = document.getElementById('header-menu');
  if (!btn || !menu) return;

  function openMenu()  { menu.classList.add('open');  btn.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.contains('open') ? closeMenu() : openMenu();
  });

  var mReload = document.getElementById('menu-reload');
  var mLogout = document.getElementById('menu-logout');

  if (mReload) mReload.addEventListener('click', function(e) { e.preventDefault(); closeMenu(); loadData(); });
  if (mLogout) mLogout.addEventListener('click', function(e) { e.preventDefault(); closeMenu(); logout(); });

  document.addEventListener('click', function(e) {
    if (!menu.contains(e.target) && e.target !== btn) closeMenu();
  }, { passive: true });

  window.addEventListener('resize', closeMenu);
})();

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, isError) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast' + (isError ? ' error' : '') + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// ── Export JSON ───────────────────────────────────────────────────────────────
function exportJSON() {
  if (!portfolioData) { showToast('No data to export', true); return; }
  var blob = new Blob([JSON.stringify(portfolioData, null, 2)], {type: 'application/json'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('data.json exported');
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadData() {
  var loadEl = document.getElementById('loading');
  loadEl.textContent    = 'Loading…';
  loadEl.style.display  = 'flex';
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  try {
    var res = await fetch('./data.json?_=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    portfolioData = await res.json();
    loadEl.style.display = 'none';
    document.getElementById('section-about').classList.add('active');
    renderAllSections();
    showToast('data.json loaded successfully');
  } catch (err) {
    loadEl.textContent = 'Error: ' + err.message + '. Serve via a local server (e.g. npx serve . or VS Code Live Server).';
    showToast('Failed to load data.json', true);
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function el(tag, attrs, html) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); });
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function inputRow(labelText, id, type, value, placeholder) {
  var group = el('div', {class: 'form-group'});
  group.innerHTML = '<label for="' + id + '">' + labelText + '</label>'
    + '<input type="' + (type||'text') + '" id="' + id + '" value="' + escHtml(value||'') + '" placeholder="' + escHtml(placeholder||'') + '">';
  return group;
}
function textareaRow(labelText, id, value, placeholder) {
  var group = el('div', {class: 'form-group'});
  group.innerHTML = '<label for="' + id + '">' + labelText + '</label>'
    + '<textarea id="' + id + '" placeholder="' + escHtml(placeholder||'') + '">' + escHtml(value||'') + '</textarea>';
  return group;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function val(id)    { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
function intVal(id) { return parseInt(val(id), 10) || 0; }

// ── Save helpers ──────────────────────────────────────────────────────────────
function saveSection(key, data) {
  if (!portfolioData) return;
  portfolioData[key] = data;
  showToast('Saved! Click Export to download updated data.json');
}

// ── Render all sections ───────────────────────────────────────────────────────
function renderAllSections() {
  renderAbout();
  renderServicesAbout();
  renderTimeline('education');
  renderTimeline('experience');
  renderSkills();
  renderServicesPage();
  renderProjects();
  renderBlog();
}

// ── About ─────────────────────────────────────────────────────────────────────
function renderAbout() {
  var sec = document.getElementById('section-about');
  var d   = portfolioData.about || {};
  sec.innerHTML = '';

  var title = el('h2', {class: 'section-title'}, 'About');
  sec.appendChild(title);

  var card = el('div', {class: 'card'});

  // basic fields
  var row1 = el('div', {class: 'row'});
  row1.appendChild(inputRow('Name',     'about-name',     'text',  d.name,     'Full name'));
  row1.appendChild(inputRow('Title',    'about-title',    'text',  d.title,    'Job title'));
  card.appendChild(row1);

  var row2 = el('div', {class: 'row'});
  row2.appendChild(inputRow('Email',    'about-email',    'email', d.email,    'Email'));
  row2.appendChild(inputRow('Phone',    'about-phone',    'text',  d.phone,    '+254...'));
  card.appendChild(row2);

  var row3 = el('div', {class: 'row'});
  row3.appendChild(inputRow('Location', 'about-location', 'text',  d.location, 'City, Country'));
  row3.appendChild(inputRow('Birthday (display)', 'about-birthday', 'text', d.birthday ? d.birthday.display : '', 'Sep 09, 2000'));
  card.appendChild(row3);

  // Bio paragraphs
  var bioHeader = el('div', {class: 'card-header'});
  bioHeader.innerHTML = '<h3>Bio Paragraphs</h3>';
  var addBioBtn = el('button', {class: 'btn btn-secondary btn-sm'}, '+ Add paragraph');
  bioHeader.appendChild(addBioBtn);
  card.appendChild(bioHeader);

  var bioContainer = el('div', {id: 'bio-container', class: 'items-container'});
  (d.bio || []).forEach(function(para, i) {
    bioContainer.appendChild(makeBioItem(para, i));
  });
  card.appendChild(bioContainer);

  addBioBtn.addEventListener('click', function() {
    var idx = bioContainer.children.length;
    bioContainer.appendChild(makeBioItem('', idx));
  });

  // Avatar
  var avatarHeader = el('div', {class: 'card-header'}, '<h3>Avatar</h3>');
  card.appendChild(avatarHeader);
  var rowA = el('div', {class: 'row'});
  rowA.appendChild(inputRow('Fallback (jpg path)', 'about-avatar-fallback', 'text', d.avatar ? d.avatar.fallback : '', './assets/images/...'));
  rowA.appendChild(inputRow('Alt text',            'about-avatar-alt',      'text', d.avatar ? d.avatar.alt      : '', 'Alt text'));
  card.appendChild(rowA);

  // Social
  var socialHeader = el('div', {class: 'card-header'}, '<h3>Social Links</h3>');
  var addSocBtn = el('button', {class: 'btn btn-secondary btn-sm'}, '+ Add');
  socialHeader.appendChild(addSocBtn);
  card.appendChild(socialHeader);

  var socContainer = el('div', {id: 'social-container', class: 'items-container'});
  (d.social || []).forEach(function(s, i) { socContainer.appendChild(makeSocialItem(s, i)); });
  card.appendChild(socContainer);
  addSocBtn.addEventListener('click', function() {
    socContainer.appendChild(makeSocialItem({name:'',url:'',icon:''}, socContainer.children.length));
  });

  // Save
  var saveBtn = el('button', {class: 'btn btn-primary', style: 'margin-top:1rem'}, 'Save About');
  saveBtn.addEventListener('click', function() {
    var bio = Array.from(document.querySelectorAll('.bio-textarea')).map(function(t) { return t.value.trim(); }).filter(Boolean);
    var social = Array.from(document.querySelectorAll('.social-item')).map(function(item) {
      return {
        name: item.querySelector('.soc-name').value.trim(),
        url:  item.querySelector('.soc-url').value.trim(),
        icon: item.querySelector('.soc-icon').value.trim()
      };
    });
    saveSection('about', {
      name:      val('about-name'),
      title:     val('about-title'),
      email:     val('about-email'),
      phone:     val('about-phone'),
      phoneHref: val('about-phone').replace(/\s/g,''),
      location:  val('about-location'),
      birthday:  { display: val('about-birthday'), datetime: '' },
      avatar:    { fallback: val('about-avatar-fallback'), webp: val('about-avatar-fallback').replace(/\.[^.]+$/,''), alt: val('about-avatar-alt') },
      bio:       bio,
      social:    social
    });
  });
  card.appendChild(saveBtn);
  sec.appendChild(card);
}

function makeBioItem(para, i) {
  var wrap = el('div', {class: 'bio-item'});
  var ta   = el('textarea', {class: 'bio-textarea', placeholder: 'Paragraph ' + (i+1) + '…'}, escHtml(para));
  var rm   = el('button', {class: 'btn btn-danger btn-sm', title: 'Remove'}, '✕');
  rm.addEventListener('click', function() { wrap.remove(); });
  wrap.appendChild(ta);
  wrap.appendChild(rm);
  return wrap;
}

function makeSocialItem(s, i) {
  var wrap = el('div', {class: 'social-item card', style: 'padding:0.75rem'});
  var row  = el('div', {class: 'row-3'});
  var n = el('div', {class: 'form-group'}); n.innerHTML = '<label>Name</label><input class="soc-name" type="text" value="' + escHtml(s.name||'') + '" placeholder="Twitter">';
  var u = el('div', {class: 'form-group'}); u.innerHTML = '<label>URL</label><input class="soc-url" type="url" value="' + escHtml(s.url||'') + '" placeholder="https://...">';
  var ic= el('div', {class: 'form-group'}); ic.innerHTML= '<label>Ion-icon name</label><input class="soc-icon" type="text" value="' + escHtml(s.icon||'') + '" placeholder="logo-twitter">';
  row.appendChild(n); row.appendChild(u); row.appendChild(ic);
  var rm = el('button', {class: 'btn btn-danger btn-sm', style:'margin-top:0.5rem'}, '✕ Remove');
  rm.addEventListener('click', function() { wrap.remove(); });
  wrap.appendChild(row); wrap.appendChild(rm);
  return wrap;
}

// ── Services (About page) ─────────────────────────────────────────────────────
function renderServicesAbout() {
  var sec = document.getElementById('section-services-about');
  sec.innerHTML = '<h2 class="section-title">Services – About Page</h2>';
  var container = el('div', {id: 'services-about-container', class: 'items-container'});
  (portfolioData.services || []).forEach(function(s, i) {
    container.appendChild(makeServiceAboutCard(s, i));
  });
  sec.appendChild(container);
  var addBtn = el('button', {class: 'btn btn-secondary add-btn'}, '+ Add Service');
  addBtn.addEventListener('click', function() {
    var i = container.children.length;
    container.appendChild(makeServiceAboutCard({icon:'',iconAlt:'',title:'',description:''}, i));
  });
  sec.appendChild(addBtn);
  var saveBtn = el('button', {class: 'btn btn-primary', style:'margin-top:1rem'}, 'Save Services (About)');
  saveBtn.addEventListener('click', function() {
    var data = Array.from(container.querySelectorAll('.service-about-card')).map(function(c) {
      return {
        icon:        c.querySelector('.sa-icon').value.trim(),
        iconAlt:     c.querySelector('.sa-iconalt').value.trim(),
        title:       c.querySelector('.sa-title').value.trim(),
        description: c.querySelector('.sa-desc').value.trim()
      };
    });
    saveSection('services', data);
  });
  sec.appendChild(saveBtn);
}

function makeServiceAboutCard(s, i) {
  var card = el('div', {class: 'card service-about-card'});
  var header = el('div', {class: 'card-header'});
  header.innerHTML = '<h3>Service ' + (i+1) + '</h3>';
  var rm = el('button', {class: 'btn btn-danger btn-sm'}, '✕ Remove');
  rm.addEventListener('click', function() { card.remove(); });
  header.appendChild(rm);
  card.appendChild(header);
  var row = el('div', {class: 'row'});
  var t = el('div', {class:'form-group'}); t.innerHTML = '<label>Title</label><input class="sa-title" type="text" value="' + escHtml(s.title||'') + '">';
  var ic= el('div', {class:'form-group'}); ic.innerHTML= '<label>Icon path</label><input class="sa-icon" type="text" value="' + escHtml(s.icon||'') + '">';
  row.appendChild(t); row.appendChild(ic);
  card.appendChild(row);
  var row2 = el('div', {class: 'row'});
  var ia= el('div', {class:'form-group'}); ia.innerHTML= '<label>Icon Alt</label><input class="sa-iconalt" type="text" value="' + escHtml(s.iconAlt||'') + '">';
  row2.appendChild(ia);
  card.appendChild(row2);
  var dg = el('div', {class:'form-group'}); dg.innerHTML = '<label>Description</label><textarea class="sa-desc">' + escHtml(s.description||'') + '</textarea>';
  card.appendChild(dg);
  return card;
}

// ── Timeline (Education / Experience) ─────────────────────────────────────────
function renderTimeline(key) {
  var sec   = document.getElementById('section-' + key);
  var label = key.charAt(0).toUpperCase() + key.slice(1);
  sec.innerHTML = '<h2 class="section-title">' + label + '</h2>';
  var container = el('div', {id: key + '-container', class: 'items-container'});
  (portfolioData[key] || []).forEach(function(item, i) {
    container.appendChild(makeTimelineCard(item, i, key));
  });
  sec.appendChild(container);
  var addBtn = el('button', {class: 'btn btn-secondary add-btn'}, '+ Add ' + label.slice(0,-1));
  addBtn.addEventListener('click', function() {
    container.appendChild(makeTimelineCard({title:'',period:'',description:''}, container.children.length, key));
  });
  sec.appendChild(addBtn);
  var saveBtn = el('button', {class: 'btn btn-primary', style:'margin-top:1rem'}, 'Save ' + label);
  saveBtn.addEventListener('click', function() {
    var data = Array.from(container.querySelectorAll('.timeline-card')).map(function(c) {
      return {
        title:       c.querySelector('.tl-title').value.trim(),
        period:      c.querySelector('.tl-period').value.trim(),
        description: c.querySelector('.tl-desc').value.trim()
      };
    });
    saveSection(key, data);
  });
  sec.appendChild(saveBtn);
}

function makeTimelineCard(item, i, key) {
  var card = el('div', {class: 'card timeline-card'});
  var header = el('div', {class: 'card-header'});
  header.innerHTML = '<h3>Entry ' + (i+1) + '</h3>';
  var rm = el('button', {class: 'btn btn-danger btn-sm'}, '✕ Remove');
  rm.addEventListener('click', function() { card.remove(); });
  header.appendChild(rm);
  card.appendChild(header);
  var row = el('div', {class: 'row'});
  var t = el('div', {class:'form-group'}); t.innerHTML = '<label>Title</label><input class="tl-title" type="text" value="' + escHtml(item.title||'') + '">';
  var p = el('div', {class:'form-group'}); p.innerHTML = '<label>Period</label><input class="tl-period" type="text" value="' + escHtml(item.period||'') + '" placeholder="Jan 2023 — Jan 2024">';
  row.appendChild(t); row.appendChild(p);
  card.appendChild(row);
  var dg = el('div', {class:'form-group'}); dg.innerHTML = '<label>Description</label><textarea class="tl-desc">' + escHtml(item.description||'') + '</textarea>';
  card.appendChild(dg);
  return card;
}

// ── Skills ────────────────────────────────────────────────────────────────────
function renderSkills() {
  var sec = document.getElementById('section-skills');
  sec.innerHTML = '<h2 class="section-title">Skills</h2>';
  var container = el('div', {id: 'skills-container', class: 'items-container'});
  (portfolioData.skills || []).forEach(function(skill, i) {
    container.appendChild(makeSkillCard(skill, i));
  });
  sec.appendChild(container);
  var addBtn = el('button', {class: 'btn btn-secondary add-btn'}, '+ Add Skill');
  addBtn.addEventListener('click', function() {
    container.appendChild(makeSkillCard({name:'', level:80}, container.children.length));
  });
  sec.appendChild(addBtn);
  var saveBtn = el('button', {class: 'btn btn-primary', style:'margin-top:1rem'}, 'Save Skills');
  saveBtn.addEventListener('click', function() {
    var data = Array.from(container.querySelectorAll('.skill-card')).map(function(c) {
      return { name: c.querySelector('.sk-name').value.trim(), level: parseInt(c.querySelector('.sk-level').value,10)||0 };
    });
    saveSection('skills', data);
  });
  sec.appendChild(saveBtn);
}

function makeSkillCard(skill, i) {
  var card = el('div', {class: 'card skill-card'});
  var header = el('div', {class: 'card-header'});
  header.innerHTML = '<h3>Skill ' + (i+1) + '</h3>';
  var rm = el('button', {class: 'btn btn-danger btn-sm'}, '✕');
  rm.addEventListener('click', function() { card.remove(); });
  header.appendChild(rm);
  card.appendChild(header);
  var row = el('div', {class: 'skill-level-row'});
  var ng = el('div', {class:'form-group', style:'flex:1'}); ng.innerHTML = '<label>Skill name</label><input class="sk-name" type="text" value="' + escHtml(skill.name||'') + '">';
  var lg = el('div', {class:'form-group'});
  var levelInput = el('input', {class:'sk-level', type:'number', min:'0', max:'100', value: skill.level||0, style:'width:80px'});
  var bar = el('div', {class:'skill-level-bar'}); bar.innerHTML = '<div class="skill-level-bar-fill" style="width:' + (skill.level||0) + '%"></div>';
  levelInput.addEventListener('input', function() {
    bar.querySelector('.skill-level-bar-fill').style.width = (Math.min(100,Math.max(0,parseInt(this.value,10)||0))) + '%';
  });
  lg.innerHTML = '<label>Level (0-100)</label>';
  lg.appendChild(levelInput);
  row.appendChild(ng); row.appendChild(lg); row.appendChild(bar);
  card.appendChild(row);
  return card;
}

// ── Services Page ─────────────────────────────────────────────────────────────
function renderServicesPage() {
  var sec = document.getElementById('section-services-page');
  var d   = portfolioData.servicesPage || {};
  sec.innerHTML = '<h2 class="section-title">Services Page</h2>';

  var introCard = el('div', {class: 'card'});
  introCard.appendChild(textareaRow('Intro text', 'sp-intro', d.intro, 'Intro paragraph…'));
  sec.appendChild(introCard);

  // Cards
  var cardsHeader = el('div', {class: 'card-header', style:'margin-top:1rem'});
  cardsHeader.innerHTML = '<h3>Service Cards</h3>';
  var addCardBtn = el('button', {class: 'btn btn-secondary btn-sm'}, '+ Add Card');
  cardsHeader.appendChild(addCardBtn);
  sec.appendChild(cardsHeader);

  var cardsContainer = el('div', {id: 'sp-cards-container', class: 'items-container'});
  (d.cards || []).forEach(function(c, i) { cardsContainer.appendChild(makeSpCard(c, i)); });
  sec.appendChild(cardsContainer);
  addCardBtn.addEventListener('click', function() {
    cardsContainer.appendChild(makeSpCard({title:'', items:[]}, cardsContainer.children.length));
  });

  // Ideal clients
  var icHeader = el('div', {class: 'card-header', style:'margin-top:1rem'});
  icHeader.innerHTML = '<h3>Ideal Clients</h3>';
  var addIcBtn = el('button', {class: 'btn btn-secondary btn-sm'}, '+ Add');
  icHeader.appendChild(addIcBtn);
  sec.appendChild(icHeader);

  var icContainer = el('div', {id: 'sp-ic-container', class: 'items-container'});
  (d.idealClients || []).forEach(function(ic) { icContainer.appendChild(makeIcItem(ic)); });
  sec.appendChild(icContainer);
  addIcBtn.addEventListener('click', function() { icContainer.appendChild(makeIcItem('')); });

  var saveBtn = el('button', {class: 'btn btn-primary', style:'margin-top:1rem'}, 'Save Services Page');
  saveBtn.addEventListener('click', function() {
    var cards = Array.from(cardsContainer.querySelectorAll('.sp-card')).map(function(c) {
      return {
        title: c.querySelector('.sp-card-title').value.trim(),
        items: Array.from(c.querySelectorAll('.sp-card-item')).map(function(i) { return i.value.trim(); }).filter(Boolean)
      };
    });
    var ic = Array.from(icContainer.querySelectorAll('.ic-input')).map(function(i) { return i.value.trim(); }).filter(Boolean);
    saveSection('servicesPage', { intro: val('sp-intro'), cards: cards, idealClients: ic });
  });
  sec.appendChild(saveBtn);
}

function makeSpCard(c, i) {
  var card = el('div', {class: 'card sp-card'});
  var header = el('div', {class: 'card-header'});
  header.innerHTML = '<h3>Card ' + (i+1) + '</h3>';
  var rm = el('button', {class: 'btn btn-danger btn-sm'}, '✕');
  rm.addEventListener('click', function() { card.remove(); });
  header.appendChild(rm);
  card.appendChild(header);
  var tg = el('div', {class:'form-group'}); tg.innerHTML = '<label>Card Title</label><input class="sp-card-title" type="text" value="' + escHtml(c.title||'') + '">';
  card.appendChild(tg);
  var itemsLabel = el('div', {class:'form-group'}); itemsLabel.innerHTML = '<label>Items</label>';
  var itemsContainer = el('div', {class: 'items-container', style:'gap:0.4rem'});
  (c.items || []).forEach(function(item) { itemsContainer.appendChild(makeSpCardItem(item)); });
  var addItem = el('button', {class:'btn btn-secondary btn-sm', style:'margin-top:0.3rem'}, '+ Add item');
  addItem.addEventListener('click', function() { itemsContainer.appendChild(makeSpCardItem('')); });
  itemsLabel.appendChild(itemsContainer);
  itemsLabel.appendChild(addItem);
  card.appendChild(itemsLabel);
  return card;
}

function makeSpCardItem(text) {
  var wrap = el('div', {style: 'display:flex; gap:0.4rem'});
  var input = el('input', {class:'sp-card-item', type:'text', value: escHtml(text||''), placeholder:'List item…', style:'flex:1'});
  var rm = el('button', {class:'btn btn-danger btn-sm'}, '✕');
  rm.addEventListener('click', function() { wrap.remove(); });
  wrap.appendChild(input); wrap.appendChild(rm);
  return wrap;
}

function makeIcItem(text) {
  var wrap = el('div', {style: 'display:flex; gap:0.4rem'});
  var input = el('input', {class:'ic-input', type:'text', value: escHtml(text||''), placeholder:'Ideal client…', style:'flex:1'});
  var rm = el('button', {class:'btn btn-danger btn-sm'}, '✕');
  rm.addEventListener('click', function() { wrap.remove(); });
  wrap.appendChild(input); wrap.appendChild(rm);
  return wrap;
}

// ── Projects ──────────────────────────────────────────────────────────────────
function renderProjects() {
  var sec = document.getElementById('section-projects');
  sec.innerHTML = '<h2 class="section-title">Projects</h2>';
  var container = el('div', {id: 'projects-container', class: 'items-container'});
  (portfolioData.projects || []).forEach(function(p, i) { container.appendChild(makeProjectCard(p, i)); });
  sec.appendChild(container);
  var addBtn = el('button', {class: 'btn btn-secondary add-btn'}, '+ Add Project');
  addBtn.addEventListener('click', function() {
    container.appendChild(makeProjectCard({title:'',url:'',image:'',alt:'',category:'',filterCategory:''}, container.children.length));
  });
  sec.appendChild(addBtn);
  var saveBtn = el('button', {class: 'btn btn-primary', style:'margin-top:1rem'}, 'Save Projects');
  saveBtn.addEventListener('click', function() {
    var data = Array.from(container.querySelectorAll('.project-card')).map(function(c) {
      var img = c.querySelector('.pr-image').value.trim();
      return {
        title:          c.querySelector('.pr-title').value.trim(),
        url:            c.querySelector('.pr-url').value.trim(),
        image:          img,
        webp:           img.replace(/\.[^.]+$/,''),
        alt:            c.querySelector('.pr-alt').value.trim(),
        category:       c.querySelector('.pr-category').value.trim(),
        filterCategory: c.querySelector('.pr-filter').value.trim()
      };
    });
    saveSection('projects', data);
  });
  sec.appendChild(saveBtn);
}

function makeProjectCard(p, i) {
  var card = el('div', {class: 'card project-card'});
  var header = el('div', {class: 'card-header'});
  header.innerHTML = '<h3>' + escHtml(p.title || ('Project ' + (i+1))) + '</h3>';
  var rm = el('button', {class: 'btn btn-danger btn-sm'}, '✕');
  rm.addEventListener('click', function() { card.remove(); });
  header.appendChild(rm);
  card.appendChild(header);
  var row1 = el('div', {class:'row'});
  var tg = el('div',{class:'form-group'}); tg.innerHTML='<label>Title</label><input class="pr-title" type="text" value="' + escHtml(p.title||'') + '">';
  var ug = el('div',{class:'form-group'}); ug.innerHTML='<label>URL</label><input class="pr-url" type="url" value="' + escHtml(p.url||'') + '">';
  row1.appendChild(tg); row1.appendChild(ug);
  card.appendChild(row1);
  var row2 = el('div', {class:'row'});
  var ig = el('div',{class:'form-group'}); ig.innerHTML='<label>Image path</label><input class="pr-image" type="text" value="' + escHtml(p.image||'') + '">';
  var ag = el('div',{class:'form-group'}); ag.innerHTML='<label>Alt text</label><input class="pr-alt" type="text" value="' + escHtml(p.alt||'') + '">';
  row2.appendChild(ig); row2.appendChild(ag);
  card.appendChild(row2);
  var row3 = el('div', {class:'row'});
  var cg = el('div',{class:'form-group'}); cg.innerHTML='<label>Category</label><input class="pr-category" type="text" value="' + escHtml(p.category||'') + '">';
  var fg = el('div',{class:'form-group'}); fg.innerHTML='<label>Filter category</label><input class="pr-filter" type="text" value="' + escHtml(p.filterCategory||'') + '">';
  row3.appendChild(cg); row3.appendChild(fg);
  card.appendChild(row3);
  return card;
}

// ── Blog ──────────────────────────────────────────────────────────────────────
function renderBlog() {
  var sec = document.getElementById('section-blog');
  sec.innerHTML = '<h2 class="section-title">Blog Posts</h2>';
  var container = el('div', {id: 'blog-container', class: 'items-container'});
  (portfolioData.blog || []).forEach(function(b, i) { container.appendChild(makeBlogCard(b, i)); });
  sec.appendChild(container);
  var addBtn = el('button', {class: 'btn btn-secondary add-btn'}, '+ Add Post');
  addBtn.addEventListener('click', function() {
    container.appendChild(makeBlogCard({title:'',url:'',image:'',alt:'',category:'',datetime:'',date:'',excerpt:''}, container.children.length));
  });
  sec.appendChild(addBtn);
  var saveBtn = el('button', {class: 'btn btn-primary', style:'margin-top:1rem'}, 'Save Blog');
  saveBtn.addEventListener('click', function() {
    var data = Array.from(container.querySelectorAll('.blog-card')).map(function(c) {
      var img = c.querySelector('.bl-image').value.trim();
      var dt  = c.querySelector('.bl-datetime').value.trim();
      return {
        title:    c.querySelector('.bl-title').value.trim(),
        url:      c.querySelector('.bl-url').value.trim(),
        image:    img,
        webp:     img.replace(/\.[^.]+$/,''),
        alt:      c.querySelector('.bl-alt').value.trim(),
        category: c.querySelector('.bl-category').value.trim(),
        datetime: dt,
        date:     dt ? new Date(dt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'}) : '',
        excerpt:  c.querySelector('.bl-excerpt').value.trim()
      };
    });
    saveSection('blog', data);
  });
  sec.appendChild(saveBtn);
}

function makeBlogCard(b, i) {
  var card = el('div', {class: 'card blog-card'});
  var header = el('div', {class: 'card-header'});
  header.innerHTML = '<h3>' + escHtml(b.title || ('Post ' + (i+1))) + '</h3>';
  var rm = el('button', {class: 'btn btn-danger btn-sm'}, '✕');
  rm.addEventListener('click', function() { card.remove(); });
  header.appendChild(rm);
  card.appendChild(header);
  var row1 = el('div', {class:'row'});
  var tg = el('div',{class:'form-group'}); tg.innerHTML='<label>Title</label><input class="bl-title" type="text" value="' + escHtml(b.title||'') + '">';
  var ug = el('div',{class:'form-group'}); ug.innerHTML='<label>URL</label><input class="bl-url" type="url" value="' + escHtml(b.url||'') + '">';
  row1.appendChild(tg); row1.appendChild(ug);
  card.appendChild(row1);
  var row2 = el('div', {class:'row'});
  var ig = el('div',{class:'form-group'}); ig.innerHTML='<label>Image path</label><input class="bl-image" type="text" value="' + escHtml(b.image||'') + '">';
  var ag = el('div',{class:'form-group'}); ag.innerHTML='<label>Alt text</label><input class="bl-alt" type="text" value="' + escHtml(b.alt||'') + '">';
  row2.appendChild(ig); row2.appendChild(ag);
  card.appendChild(row2);
  var row3 = el('div', {class:'row'});
  var cg = el('div',{class:'form-group'}); cg.innerHTML='<label>Category</label><input class="bl-category" type="text" value="' + escHtml(b.category||'') + '">';
  var dg = el('div',{class:'form-group'}); dg.innerHTML='<label>Date</label><input class="bl-datetime" type="date" value="' + escHtml(b.datetime||'') + '">';
  row3.appendChild(cg); row3.appendChild(dg);
  card.appendChild(row3);
  var eg = el('div',{class:'form-group'}); eg.innerHTML='<label>Excerpt</label><textarea class="bl-excerpt">' + escHtml(b.excerpt||'') + '</textarea>';
  card.appendChild(eg);
  return card;
}

function toWebp(path) {
  var p = (path || '').trim();
  if (!p) return '';
  if (/\.webp($|\?)/i.test(p)) return p;
  if (/\.[^.]+($|\?)/.test(p)) return p.replace(/\.[^.]+($|\?)/, '.webp$1');
  return p + '.webp';
}

