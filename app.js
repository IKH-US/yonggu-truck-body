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
    { label:'CUSTOM BOX BODY', title:'一個車廂。\n按你的需要而造。', text:'鋁質或鐵質車廂，配合車架、貨物尺寸及日常用途。從開門方式到內部間隔，逐項確認合適配置。', features:['物料與尺寸選擇','開門與裝卸安排','地板及內部配置'], image:'images/illustrations/product-box.svg', alt:'密斗車廂剖面示意圖：鋁質外板、廂骨、地板及尾門', style:'' },
    { label:'TAIL LIFT SOLUTIONS', title:'上落重貨，\n多一份支援。', text:'按貨物重量、裝卸習慣與車輛條件，評估尾板配置及安裝方式。新車或現有貨車均可先查詢。', features:['安裝空間評估','載重與用途配合','現有車架檢查'], image:'images/illustrations/product-tail-lift.svg', alt:'升降尾板示意圖：平台由地面升至車廂地台高度', style:'' },
    { label:'ACCESS & INTERIOR', title:'門與間隔，\n跟住工作方式改。', text:'側門、貨架、地板與車廂內部配置，按貨物種類及取放次序設計，讓每日工作更有條理。', features:['側門開口安排','內部貨架與間隔','地板與收邊配置'], image:'images/illustrations/product-side-door.svg', alt:'側門及內部示意圖：側門開口、分層貨架及地板收邊', style:'' }
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
    {title:'由量準每一吋開始。', text:'了解車款、車架、貨物及裝卸方式，再核對尺寸與現有條件，為訂造方案打好基礎。', image:'images/illustrations/process-measure.svg', alt:'量度示意圖：車架長度、軸距及車架高度', label:'MEASURE'},
    {title:'先想清楚，再開始造。', text:'討論物料、開門方向、內部配置及預算，將實際用途轉化成清晰方案，再確認報價與製作安排。', image:'images/illustrations/process-design.svg', alt:'設計圖示意：車廂平面及側視佈局', label:'DESIGN'},
    {title:'把每一個細節，做到位。', text:'按已確認方案安排車廂製作、組裝與配置安裝，留意接合、收邊及日後使用的便利。', image:'images/illustrations/process-build.svg', alt:'製作示意圖：角柱接合、鉚接位置及收邊', label:'BUILD'},
    {title:'準備好，再出發。', text:'完成後一齊核對車廂及配置，確認使用方式、交付安排與後續跟進，迎接下一程工作。', image:'images/illustrations/process-handover.svg', alt:'交車示意圖：完成車輛及交車核對清單', label:'HANDOVER'}
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
  function addContact(text, href) { const el = document.createElement(href ? 'a' : 'p'); el.textContent = text; if (href) el.href = href; contactMethods.append(el); }
  if (business.phone) addContact(business.phone, 'tel:' + business.phone.replace(/[^+\d]/g,''));
  if (whatsapp) addContact('WhatsApp 查詢 ↗', 'https://wa.me/' + whatsapp);
  if (email) addContact(email, 'mailto:' + email);
  if (business.address) addContact(business.address);
  if (business.hours) addContact(business.hours);
  if (whatsapp || email) {
    $('#contactAvailability').hidden = true;
    $('#sendEnquiry').firstChild.textContent = whatsapp ? '在 WhatsApp 開啟查詢 ' : '以電郵開啟查詢 ';
    $('#formHelp').textContent = '將於 WhatsApp 或電郵開啟已整理的內容，由你確認後發送。';
    if (whatsapp) { $('#mobileContact').href = 'https://wa.me/' + whatsapp; $('#mobileContact').lastElementChild.textContent = 'WhatsApp ↗'; }
  }
  $('#enquiryForm').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form);
    const text = `你好，我想向永固車廂廠查詢：\n\n稱呼：${data.get('name')}\n聯絡電話：${data.get('phone')}\n項目：${data.get('type')}\n車款／數量：${data.get('spec') || '未填寫'}\n\n${data.get('message') || ''}`;
    const status = $('#formStatus');
    if (whatsapp) { window.open('https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer'); status.textContent = '已開啟 WhatsApp 查詢，請檢查內容後自行發送。'; return; }
    if (email) { location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('網站查詢：' + data.get('type')) + '&body=' + encodeURIComponent(text); status.textContent = '已要求開啟電郵程式，請檢查收件人及內容後發送。'; return; }
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
  if (!motionQuery.matches && !navigator.connection?.saveData && webglOk()) {
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
