/* Dependency-free, portable website. Scroll animation is rendered once per frame. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const smooth = v => v * v * (3 - 2 * v);
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const compactQuery = matchMedia('(max-width: 900px)');
  const hero = $('#hero'), stage = $('.hero-stage'), header = $('#header');
  const visual = $('.hero-visual'), intro = $('.hero-intro'), messages = $$('.hero-message');
  let frame = 0, heroProgress = 0, targetProgress = 0;

  // Closed menus leave both the keyboard order and accessibility tree.
  const menu = $('#mobileMenu'), toggle = $('#menuToggle');
  function closeMenu(restoreFocus = false) {
    menu.hidden = true; menu.inert = true;
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', '開啟選單');
    document.body.classList.remove('menu-open'); header.classList.remove('menu-active');
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    if (!menu.hidden) return closeMenu(true);
    menu.hidden = false; menu.inert = false;
    toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', '關閉選單');
    document.body.classList.add('menu-open'); header.classList.add('menu-active');
    $('a', menu).focus();
  });
  $$('a', menu).forEach(a => a.addEventListener('click', () => closeMenu(false)));
  document.addEventListener('keydown', e => {
    if (menu.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    if (e.key === 'Tab') {
      const items = [toggle, ...$$('a', menu)], index = items.indexOf(document.activeElement);
      e.preventDefault(); items[(index + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });

  // Progressive enhancement: content remains visible if observers are unavailable.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
    }), { threshold: .08 });
    $$('.reveal').forEach(el => revealObserver.observe(el));
  } else $$('.reveal').forEach(el => el.classList.add('is-visible'));

  const products = [
    { label:'CUSTOM BOX BODY', title:'一個車廂。\n按你的需要而造。', text:'鋁質或鐵質車廂，配合車架、貨物尺寸及日常用途。從開門方式到內部間隔，逐項確認合適配置。', features:['物料與尺寸選擇','開門與裝卸安排','地板及內部配置'], image:'images/product-box-photo.webp', alt:'訂製密斗寫實概念圖：鋁質車廂尾門及外板', style:'' },
    { label:'TAIL LIFT SOLUTIONS', title:'上落重貨，\n多一份支援。', text:'按貨物重量、裝卸習慣與車輛條件，評估尾板配置及安裝方式。新車或現有貨車均可先查詢。', features:['安裝空間評估','載重與用途配合','現有車架檢查'], image:'images/product-tail-lift-photo.webp', alt:'升降尾板寫實概念圖：尾板平台、托盤及手動拖板車', style:'' },
    { label:'ACCESS & INTERIOR', title:'門與間隔，\n配合工作方式調整。', text:'側門、貨架、地板與車廂內部配置，按貨物種類及取放次序設計，讓每日工作更有條理。', features:['側門開口安排','內部貨架與間隔','地板與收邊配置'], image:'images/product-side-door-photo.webp', alt:'側門配置寫實概念圖：側門開口及內部貨架', style:'' }
  ];
  let productIndex = 0;
  const productTabs = $$('[data-product]');
  function multiline(el, text) { el.replaceChildren(...text.split('\n').flatMap((line, i) => i ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)])); }
  function selectProduct(index, focus = false) {
    productIndex = (index + products.length) % products.length;
    const p = products[productIndex];
    productTabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === productIndex)); tab.tabIndex = i === productIndex ? 0 : -1; });
    $('#product-panel').setAttribute('aria-labelledby', productTabs[productIndex].id);
    $('#productLabel').textContent = p.label; multiline($('#productTitle'), p.title);
    $('#productDescription').textContent = p.text;
    $('#productFeatures').replaceChildren(...p.features.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    $('#productImage').src = p.image; $('#productImage').alt = p.alt;
    $('.product-visual').className = 'product-visual ' + p.style;
    $('.image-label').textContent = `CONFIGURATION / 0${productIndex + 1}`;
    if (focus) productTabs[productIndex].focus();
  }
  function tabKeyboard(e, index, total, select) {
    const next = e.key === 'ArrowRight' ? (index + 1) % total : e.key === 'ArrowLeft' ? (index + total - 1) % total : e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : null;
    if (next !== null) { e.preventDefault(); select(next, true); }
  }
  productTabs.forEach((tab, i) => { tab.addEventListener('click', () => selectProduct(i)); tab.addEventListener('keydown', e => tabKeyboard(e, i, products.length, selectProduct)); });
  $('#productPrev').addEventListener('click', () => selectProduct(productIndex - 1));
  $('#productNext').addEventListener('click', () => selectProduct(productIndex + 1));

  const steps = [
    {title:'由量準每一吋開始。', text:'了解車款、車架、貨物及裝卸方式，再核對尺寸與現有條件，為訂造方案打好基礎。', image:'images/process-measure-photo.webp', alt:'量度寫實概念圖：技師核對車架尺寸', label:'MEASURE'},
    {title:'先想清楚，再開始造。', text:'討論物料、開門方向、內部配置及預算，將實際用途轉化成清晰方案，再確認報價與製作安排。', image:'images/process-design-photo.webp', alt:'設計寫實概念圖：車廂規劃圖及物料樣本', label:'DESIGN'},
    {title:'把每一個細節，做到位。', text:'按已確認方案安排車廂製作、組裝與配置安裝，留意接合、收邊及日後使用的便利。', image:'images/process-build-photo.webp', alt:'製作寫實概念圖：技師鉚接鋁質車廂收邊', label:'BUILD'},
    {title:'準備好，再出發。', text:'完成後共同核對車廂及配置，確認使用方式、交付安排與後續跟進，迎接下一程工作。', image:'images/process-handover-photo.webp', alt:'交車寫實概念圖：完成車輛及交付核對', label:'HANDOVER'}
  ];
  const processScroll = $('#processScroll'), processTabs = $$('[data-step]');
  let stepIndex = -1, manualStepUntilScroll = false;
  function selectStep(index, focus = false) {
    if (stepIndex !== index) {
      stepIndex = index; const s = steps[index];
      $('#processNumber').textContent = `0${index + 1}`; $('#processTitle').textContent = s.title; $('#processDescription').textContent = s.text;
      $('#processImage').src = s.image; $('#processImage').alt = s.alt; $('#processVisual').dataset.step = String(index);
      $('#processImageLabel').textContent = `0${index + 1} / ${s.label}`;
      processTabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
      $('#process-panel').setAttribute('aria-labelledby', processTabs[index].id);
    }
    if (focus) processTabs[index].focus();
  }
  function manualStep(index, focus = false) { manualStepUntilScroll = true; selectStep(index, focus); }
  processTabs.forEach((tab, i) => { tab.addEventListener('click', () => manualStep(i)); tab.addEventListener('keydown', e => tabKeyboard(e, i, steps.length, manualStep)); });
  selectStep(0);

  // Configuration is a requirements summary, never an invented price quote.
  const configForm = $('#configForm');
  function configuration() {
    return { tonnage:$('#configTonnage').value, material:$('#configMaterial').value, extras:[configForm.elements.tailLift.checked ? '升降尾板' : '', configForm.elements.sideDoor.checked ? '側門及貨架' : ''].filter(Boolean).join('、') || '暫未選擇' };
  }
  function updateConfiguration() { const c = configuration(); $$('#configSummary dd').forEach((el, i) => el.textContent = [c.tonnage,c.material,c.extras][i]); }
  configForm.addEventListener('change', updateConfiguration); configForm.addEventListener('submit', e => e.preventDefault());
  $('#useConfiguration').addEventListener('click', () => {
    const c = configuration(), field = $('#enquiryMessage');
    const previous = field.value.replace(/\n?【配置摘要】[\s\S]*?【摘要完】\n?/g, '').trim();
    field.value = `${previous ? previous + '\n\n' : ''}【配置摘要】\n貨車：${c.tonnage}\n物料：${c.material}\n附加配置：${c.extras}\n【摘要完】`;
    $('#enquiryType').value = '訂製貨車車廂';
  });
  $$('[data-enquiry]').forEach(link => link.addEventListener('click', () => { $('#enquiryType').value = link.dataset.enquiry; }));

  const business = window.WINGKO_CONFIG || {};
  const whatsapp = /^\d{8,15}$/.test(business.whatsapp || '') ? business.whatsapp : '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.email || '') ? business.email : '';
  const contactMethods = $('#contactMethods');
  const track = name => { try { window.plausible?.(name); window.gtag?.('event', name); } catch {} };
  const analytics = business.analytics || {};
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(analytics.plausibleDomain || '')) {
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    const s = document.createElement('script'); s.defer = true; s.dataset.domain = analytics.plausibleDomain; s.src = 'https://plausible.io/js/script.js'; document.head.append(s);
  }
  if (/^G-[A-Z0-9]{6,}$/.test(analytics.ga4Id || '')) {
    window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + analytics.ga4Id; document.head.append(s);
    window.gtag('js', new Date()); window.gtag('config', analytics.ga4Id);
  }
  if (business.siteUrl || business.phone || business.address) {
    const ld = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: business.businessName || '永固車廂廠', description: document.querySelector('meta[name=description]')?.content || '' };
    if (business.siteUrl) ld.url = business.siteUrl;
    if (business.phone) ld.telephone = business.phone;
    if (email) ld.email = email;
    if (business.address) ld.address = { '@type': 'PostalAddress', streetAddress: business.address, addressCountry: 'HK' };
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.append(s);
  }
  const cases = Array.isArray(business.cases) ? business.cases.filter(c => c && c.title && c.image) : [];
  if (cases.length) {
    const grid = $('#casesGrid');
    cases.forEach(c => {
      const card = document.createElement('article'); card.className = 'case-card';
      const img = document.createElement('img'); img.src = c.image; img.alt = c.alt || c.title; img.loading = 'lazy'; img.width = 960; img.height = 600;
      const h = document.createElement('h3'); h.textContent = c.title;
      const dl = document.createElement('dl');
      [['車型', c.vehicle], ['貨箱', c.size], ['配置', c.setup]].forEach(([k, v]) => { if (!v) return; const row = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; row.append(dt, dd); dl.append(row); });
      card.append(img, h, dl); grid.append(card);
    });
    $('#cases').hidden = false;
  }
  function addContact(text, href) { const el = document.createElement(href ? 'a' : 'p'); el.textContent = text; if (href) el.href = href; contactMethods.append(el); }
  if (business.phone) addContact(business.phone, 'tel:' + business.phone.replace(/[^+\d]/g,''));
  if (whatsapp) addContact('WhatsApp 查詢 ↗', 'https://wa.me/' + whatsapp);
  if (email) addContact(email, 'mailto:' + email);
  if (business.address) addContact(business.address);
  if (business.hours) addContact(business.hours);
  if (business.wechat) addContact('微信：' + business.wechat);
  if (business.wechatQr) {
    const qr = document.createElement('figure'); qr.className = 'wechat-qr';
    const qrImg = document.createElement('img'); qrImg.src = business.wechatQr; qrImg.alt = '微信二維碼'; qrImg.width = 132; qrImg.height = 132; qrImg.loading = 'lazy';
    const cap = document.createElement('figcaption'); cap.textContent = '掃描加入微信';
    qr.append(qrImg, cap); contactMethods.append(qr);
  }
  if (whatsapp || email) {
    $('#contactAvailability').hidden = true;
    $('#sendEnquiry').firstChild.textContent = whatsapp ? '在 WhatsApp 開啟查詢 ' : '以電郵開啟查詢 ';
    $('#formHelp').textContent = '將於 WhatsApp 或電郵開啟已整理的內容，由你確認後發送。';
  }
  const mcMain = $('#mcMain'), mcCall = $('#mcCall'), navCta = $('.nav-cta');
  if (whatsapp) {
    mcMain.href = 'https://wa.me/' + whatsapp; mcMain.textContent = 'WhatsApp 查詢'; mcMain.target = '_blank'; mcMain.rel = 'noopener noreferrer';
    navCta.href = 'https://wa.me/' + whatsapp; navCta.target = '_blank'; navCta.rel = 'noopener noreferrer'; navCta.firstChild.textContent = 'WhatsApp 查詢 ';
  }
  if (business.phone) { mcCall.href = 'tel:' + business.phone.replace(/[^+\d]/g, ''); mcCall.hidden = false; }
  const formCfg = business.form || {};
  const useEndpoint = (formCfg.provider === 'formspree' && /^https:\/\/formspree\.io\/f\//.test(formCfg.endpoint || '')) || formCfg.provider === 'netlify';
  if (useEndpoint) {
    $('#sendEnquiry').firstChild.textContent = '提交查詢 ';
    $('#contactAvailability').hidden = true;
    $('#formHelp').textContent = '提交後，我們會按你留下的電話盡快回覆。';
  }
  $$('#mcMain,.nav-cta').forEach(a => a.addEventListener('click', () => track('contact_click')));
  async function postEnquiry(data) {
    if (formCfg.provider === 'formspree') { const r = await fetch(formCfg.endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: data }); return r.ok; }
    const body = new URLSearchParams(); data.forEach((v, k) => body.append(k, v)); body.set('form-name', 'enquiry');
    const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); return r.ok;
  }
  $('#enquiryForm').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form);
    const status = $('#formStatus');
    if (data.get('bot-field')) { status.textContent = '已收到你的查詢。'; form.reset(); return; }
    const text = `你好，我想向永固車廂廠查詢：\n\n稱呼：${data.get('name')}\n聯絡電話：${data.get('phone')}\n項目：${data.get('type')}\n車款／數量：${data.get('spec') || '未填寫'}\n\n${data.get('message') || ''}`;
    if (useEndpoint) {
      const btn = $('#sendEnquiry'); btn.disabled = true; status.textContent = '正在提交…';
      try {
        if (await postEnquiry(data)) { status.textContent = '已收到你的查詢，我們會盡快以電話回覆。'; form.reset(); track('enquiry_submit'); btn.disabled = false; return; }
        throw new Error('submit failed');
      } catch { btn.disabled = false; status.textContent = '暫時未能提交，改為整理你的查詢內容。'; }
    }
    if (whatsapp) { window.open('https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer'); status.textContent = '已開啟 WhatsApp 查詢，請檢查內容後自行發送。'; track('enquiry_submit'); return; }
    if (email) { location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('網站查詢：' + data.get('type')) + '&body=' + encodeURIComponent(text); status.textContent = '已要求開啟電郵程式，請檢查收件人及內容後發送。'; track('enquiry_submit'); return; }
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); status.textContent = '查詢內容已複製。聯絡資料更新後，可用來向永固查詢。'; $('#copyFallback').hidden = true; }
    catch { $('#copyFallback').hidden = false; $('#copyText').value = text; $('#copyText').focus(); $('#copyText').select(); status.textContent = '你可以手動複製下方已整理的查詢內容。'; }
  });
  $('#year').textContent = String(new Date().getFullYear());

  // One continuous visual for the whole introduction. No image-to-image scene changes.
  const heroFilm = window.createWingkoHeroFilm?.(stage, motionQuery, () => renderHero(heroProgress));
  const heroScan = window.createWingkoHeroScan?.(hero);

  // Real-time 3D truck (Three.js). Loaded lazily; the photo + blueprint scan stay as the fallback.
  let hero3d = null, heroVisible = true, warmed = false, last3dP = 1;
  const canvas3d = $('#hero3d'), flash3d = $('#heroFlash'), bgfx3d = $('#heroBgfx'), photoFrame = $('.truck-frame');
  const webglOk = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
  const q3d = new URLSearchParams(location.search).get('3d');
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  if (q3d !== 'off' && (q3d === 'on' || !lowEnd) && !motionQuery.matches && !navigator.connection?.saveData && webglOk()) {
    const start = () => import('./hero-3d.js').then(m => {
      heroScan?.render(0); photoFrame.style.transform = 'translate(-50%,-50%)';
      hero3d = m.createHero3D({ stage, canvas: canvas3d, labelsRoot: $('#hero3dLabels'), frameEl: photoFrame });
      hero.classList.add('has-3d'); canvas3d.style.opacity = '1';
      renderHero(heroProgress);
    }).catch(err => console.warn('3D hero unavailable, keeping the static hero.', err));
    (window.requestIdleCallback || (f => setTimeout(f, 400)))(start, { timeout: 1500 });
  }

  function renderHero(p) {
    hero.style.setProperty('--hero-p', p.toFixed(4));
    if (!hero3d) heroScan?.render(p);
    heroFilm?.sync(p);
    if (hero3d && heroVisible && (p > .04 || last3dP > .04 || !warmed) && !(p > .94 && last3dP > .94)) {
      const r = hero3d.render(p); warmed = true; last3dP = p;
      visual.style.opacity = r.photo.toFixed(3); bgfx3d.style.opacity = r.bg.toFixed(3);
      flash3d.style.opacity = r.flash.toFixed(3); flash3d.style.setProperty('--fx', r.fx.toFixed(1) + '%'); flash3d.style.setProperty('--fy', r.fy.toFixed(1) + '%');
    }
    const introOpacity = 1 - smooth(range(p,.03,.09));
    intro.style.opacity = introOpacity;
    intro.style.transform = `translateY(${-(1-introOpacity)*12}px)`;
    const scenes = [
      smooth(range(p,.12,.18)) * (1-smooth(range(p,.30,.35))),
      smooth(range(p,.37,.43)) * (1-smooth(range(p,.57,.62))),
      smooth(range(p,.70,.78))
    ];
    messages.forEach((el,i) => {
      const op=scenes[i], active=op>.01;
      el.style.opacity=op; el.classList.toggle('active',active);
      el.setAttribute('aria-hidden',String(!active));
      el.style.transform=`translateY(${(1-op)*12}px)`;
      const link=$('a',el); if(link)link.tabIndex=active?0:-1;
    });
    $('.hero-scroll-hint').style.opacity=1-range(p,0,.07);
  }
  function tick() {
    frame=0;
    if(!motionQuery.matches) {
      heroProgress += (targetProgress-heroProgress)*.16;
      if(Math.abs(targetProgress-heroProgress)<.0003||window.__heroInstant)heroProgress=targetProgress;
      renderHero(heroProgress);
      if(heroProgress!==targetProgress) frame=requestAnimationFrame(tick);
    }
  }
  function syncScroll() {
    const rect=hero.getBoundingClientRect();
    targetProgress=clamp(-rect.top/Math.max(1,hero.offsetHeight-stage.offsetHeight));
    heroVisible = rect.bottom > -60 && rect.top < innerHeight + 60;
    header.classList.toggle('on-light',rect.bottom<header.offsetHeight+50);
    if(!motionQuery.matches&&!frame)frame=requestAnimationFrame(tick);
    if(!compactQuery.matches&&!motionQuery.matches&&!manualStepUntilScroll) {
      const pr=processScroll.getBoundingClientRect();
      const progress=clamp((116-pr.top)/Math.max(1,processScroll.offsetHeight-$('.process-sticky').offsetHeight-116));
      selectStep(Math.min(3,Math.floor(progress*4)));
    }
  }
  addEventListener('scroll',()=>{manualStepUntilScroll=false;syncScroll();},{passive:true});
  let resizeFrame;
  addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!compactQuery.matches)closeMenu();syncScroll();});},{passive:true});
  motionQuery.addEventListener('change',()=>{
    heroProgress=targetProgress=0;
    if(motionQuery.matches){cancelAnimationFrame(frame);frame=0;renderHero(0);}
    syncScroll();
  });
  updateConfiguration();syncScroll();
})();
