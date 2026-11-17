import { unlockPackage, decryptAsset, sortNodes, birthdayInfo, daysSince } from './core.js';

const app = document.getElementById('app') || document.body.appendChild(Object.assign(document.createElement('main'), { id: 'app' }));
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let manifest, content, key, resolver, preview = false, generation = 0;
let events = new AbortController(), observer, sectionObserver, revealObserver, audio, lightboxIndex = 0, lightboxItems = [];
let urlCache = new Map(), urls = new Set(), musicLoading = false, loginBusy = false, animations = !reducedMotion.matches;
let toastTimer, scrollFrame = 0, celebrationTimer = 0;
function scrollToPosition(top) {
  cancelAnimationFrame(scrollFrame);
  const root=document.scrollingElement || document.documentElement;
  const start=root.scrollTop;
  const end=Math.max(0,Math.min(top,root.scrollHeight-window.innerHeight));
  const delta=end-start;
  if(!animations || Math.abs(delta)<2){window.scrollTo({top:end,behavior:'instant'});return;}
  const epoch=generation, began=performance.now();
  const duration=Math.min(1150,Math.max(650,Math.abs(delta)*.16));
  const tick=now=>{if(epoch!==generation)return;const t=Math.min(1,(now-began)/duration);const ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;window.scrollTo({top:start+delta*ease,behavior:'instant'});if(t<1)scrollFrame=requestAnimationFrame(tick);};
  scrollFrame=requestAnimationFrame(tick);
}

function toast(message) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}
function on(el, type, handler, options = {}) { el?.addEventListener(type, handler, { ...options, signal: events.signal }); }
function transitionIn(element, duration = 650, distance = 22) {
  if (!element || !animations || !element.animate) return;
  return element.animate([{opacity:0,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}], {duration,easing:'cubic-bezier(.22,.7,.2,1)'});
}
function dispose() {
  generation++; cancelAnimationFrame(scrollFrame); clearTimeout(celebrationTimer); celebrationTimer = 0; lastFocus = null; events.abort(); events = new AbortController(); observer?.disconnect(); sectionObserver?.disconnect(); revealObserver?.disconnect();
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
  for (const url of urls) URL.revokeObjectURL(url);
  urls = new Set(); urlCache = new Map(); lightboxItems = []; resolver = undefined; key = undefined; content = undefined;
  musicLoading = false; loginBusy = false; document.body.classList.remove('lightbox-open'); app.replaceChildren();
  clearTimeout(toastTimer); document.getElementById('toast')?.classList.remove('visible');
}
async function assetUrl(id) {
  if (!id) throw new Error('Missing asset');
  if (!urlCache.has(id)) {
    const epoch = generation, currentResolver = resolver;
    const promise = Promise.resolve().then(() => currentResolver(id)).then(blob => {
      if (epoch !== generation) throw new Error('Expired session');
      if (!blob || Object.prototype.toString.call(blob) !== '[object Blob]' || typeof blob.arrayBuffer !== 'function') throw new Error('Invalid asset');
      const url = URL.createObjectURL(blob); urls.add(url); return url;
    }).catch(error => { if (epoch === generation) urlCache.delete(id); throw error; });
    urlCache.set(id, promise);
  }
  return urlCache.get(id);
}
function photoMarkup(id, alt, className = '') {
  return id ? `<div class="photo-frame ${className}" data-photo-frame><img data-asset="${esc(id)}" alt="${esc(alt)}" decoding="async"><span class="photo-placeholder" aria-hidden="true">✧</span></div>` : `<div class="photo-frame ${className} empty-cover" aria-hidden="true"><span class="botanical">❧</span><span>把平凡的日子，珍藏成诗。</span></div>`;
}
async function loadImage(img) {
  if (img.dataset.loading) return;
  img.dataset.loading = 'true'; const epoch = generation;
  try {
    const url = await assetUrl(img.dataset.asset);
    if (epoch !== generation || !img.isConnected) return;
    img.onload = () => { img.closest('[data-photo-frame]')?.classList.add('loaded'); };
    img.onerror = () => imageError(img);
    img.src = url;
  } catch { if (epoch === generation && img.isConnected) imageError(img); }
}
function imageError(img) {
  const frame = img.closest('[data-photo-frame]'); if (!frame) return;
  frame.classList.add('failed'); const label = frame.querySelector('.photo-placeholder'); if (label) { label.textContent = '这张照片暂时无法打开'; label.removeAttribute('aria-hidden'); }
}
function observeImages() {
  observer?.disconnect();
  const images = app.querySelectorAll('img[data-asset]');
  if (!('IntersectionObserver' in window)) { images.forEach(loadImage); return; }
  observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { observer.unobserve(entry.target); loadImage(entry.target); } }), { rootMargin: '350px' });
  images.forEach(img => observer.observe(img));
}
function playCelebration() {
  clearTimeout(celebrationTimer);
  app.querySelectorAll('.birthday-opening').forEach(overlay => overlay.remove());
  const overlay = document.createElement('div');
  overlay.className = 'birthday-opening';
  overlay.setAttribute('role', 'button');
  overlay.setAttribute('aria-label', '关闭生日祝福');
  overlay.tabIndex = 0;
  const close = () => {
    clearTimeout(celebrationTimer);
    celebrationTimer = 0;
    overlay.remove();
  };
  overlay.addEventListener('click', close, { once: true });
  overlay.addEventListener('keydown', event => { if (['Enter', ' ', 'Escape'].includes(event.key)) { event.preventDefault(); close(); } });
  overlay.innerHTML = '<div class="birthday-opening-card"><span class="birthday-stars">✧　✦　✧</span><div class="birthday-cake"><i></i><b>▰</b></div><p>生日快乐</p><small>HAPPY BIRTHDAY TO YOU</small></div>';
  app.append(overlay);
  celebrationTimer = setTimeout(close, 4300);
}
function observeCards() {
  revealObserver?.disconnect();
  const cards = [...app.querySelectorAll('.memory-card')];
  if (!animations || !('IntersectionObserver' in window)) { cards.forEach(card => card.classList.add('is-visible')); return; }
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    revealObserver.unobserve(entry.target);
  }), { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  cards.forEach(card => revealObserver.observe(card));
}
function loginView(message = '') {
  dispose(); preview = false; document.title = '时光来信 · 私人相册';
  app.innerHTML = `<main class="login-page"><div class="login-decoration" aria-hidden="true"><span class="decoration-line"></span><span>FOR YOUR EYES ONLY</span><span class="decoration-line"></span></div><section class="login-card"><div class="book-mark" aria-hidden="true">时<br>光</div><p class="eyebrow">A LITTLE BOOK OF US</p><h1>有些时光，<br>只想与你分享。</h1><p class="login-intro">把一起笑过、闹过、聊过的日子，收进这本相册。<br>请用专属凭据，轻轻翻开。</p><form id="login-form"><label for="account">专属账号</label><input id="account" name="account" autocomplete="username" placeholder="输入你的账号" required maxlength="200"><label for="password">相册密码</label><div class="password-field"><input id="password" name="password" type="password" autocomplete="current-password" placeholder="输入相册密码" required maxlength="1000"><button id="password-toggle" type="button" aria-label="显示密码" aria-pressed="false">显示</button></div><p class="form-error" id="login-error" role="alert">${esc(message)}</p><button class="primary-button" type="submit">打开我们的时光 <span aria-hidden="true">↗</span></button></form><p class="privacy-note">私密珍藏 · 仅在此刻，为你展开</p></section><footer class="login-footer">每一页，都是想留住的瞬间。<span>HERE’S TO FRIENDSHIP</span></footer></main>`;
  on(document.getElementById('password-toggle'), 'click', event => { const input = document.getElementById('password'), show = input.type === 'password'; input.type = show ? 'text' : 'password'; event.currentTarget.textContent = show ? '隐藏' : '显示'; event.currentTarget.setAttribute('aria-label', show ? '隐藏密码' : '显示密码'); event.currentTarget.setAttribute('aria-pressed', String(show)); });
  on(document.getElementById('login-form'), 'submit', async event => {
    event.preventDefault(); if (loginBusy) return; loginBusy = true;
    const epoch = generation, button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = '正在开启相册…';
    const account = document.getElementById('account').value.trim(), password = document.getElementById('password').value;
    document.getElementById('login-error').textContent = '';
    try {
      if (!window.isSecureContext || !globalThis.crypto?.subtle) throw new Error('Crypto unavailable');
      if (!manifest) { try { const response = await fetch('./data/manifest.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Manifest unavailable'); manifest = await response.json(); } catch { throw new Error('Manifest unavailable'); } }
      const unlocked = await unlockPackage(manifest, account, password);
      if (epoch !== generation) return;
      if (!unlocked.content || !Array.isArray(unlocked.content.nodes)) throw new Error('Invalid content');
      const sessionKey = unlocked.key, privateAssets = unlocked.assets;
      mount(unlocked.content, id => decryptAsset(privateAssets, sessionKey, id), false, sessionKey);
      location.hash = 'memories';
    } catch (error) { if (epoch === generation) { const message = String(error?.message || ''); document.getElementById('login-error').textContent = /Crypto unavailable|不支持安全加密/.test(message) ? '当前环境无法安全解密，请使用现代浏览器通过 HTTPS 或 localhost 打开相册。' : message === '账号或密码不正确，或相册文件已损坏' ? message : /旧版|版本.*不支持/.test(message) ? '这是旧版相册或版本不支持，请作者使用制作端重新导出完整分享包。' : '相册文件缺失或已损坏，请确认完整上传导出文件，并通过网站地址打开。'; document.getElementById('password').value = ''; button.disabled = false; button.innerHTML = '打开我们的时光 <span aria-hidden="true">↗</span>'; loginBusy = false; } }
  });
}
function dateParts(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? { year: match[1], month: match[2], day: match[3], full: `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日` } : { year: '未标日期', month: '—', day: '—', full: '某个值得记住的日子' };
}
function safeBirthday(date) { try { const value = birthdayInfo(date); return value && Number.isFinite(value.days) ? value : null; } catch { return null; } }
function safeDays(date) { try { const value = daysSince(date); return Number.isFinite(value) ? Math.max(0, value) : null; } catch { return null; } }
function mount(nextContent, assetResolver, isPreview, sessionKey) {
  dispose(); content = nextContent; resolver = assetResolver; preview = isPreview; key = sessionKey;
  const config = content.config || {}, nodes = Array.isArray(content.nodes) ? content.nodes : [];
  animations = config.motion !== false;
  document.title = config.title || '时光来信';
  const birthday = config.birthday ? safeBirthday(config.birthday) : null, together = config.startDate ? safeDays(config.startDate) : null;
  const photoCount = nodes.reduce((n, node) => n + (Array.isArray(node.photos) ? node.photos.length : 0), 0);
  app.innerHTML = `<div class="star-field" aria-hidden="true">${Array.from({length:12},()=>'<i></i>').join('')}</div><div class="reading-progress" aria-hidden="true"><span id="reading-bar"></span></div><header class="site-header"><a class="wordmark" href="#memories"><span class="brand-icon" aria-hidden="true">✳</span><span>${esc(config.title || '时光来信')}<small>OUR LITTLE ARCHIVE</small></span></a><nav class="header-actions" aria-label="相册操作">${config.musicId ? '<button class="music-button" id="music-toggle" aria-label="播放背景音乐" aria-pressed="false"><span aria-hidden="true">♫</span><span id="music-label">放一首熟悉的歌</span></button><label class="volume-label">音量<input id="music-volume" aria-label="音乐音量" type="range" min="0" max="1" step="0.05" value="0.5"></label>' : ''}${preview ? '<span class="preview-label">相册预览</span>' : '<button class="text-button" id="logout">退出</button>'}</nav></header><main id="memories"><section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-line"></span> A COLLECTION OF BEAUTIFUL DAYS</p><p class="hero-dedication">致 ${esc(config.nickname || '我最好的朋友')} <span aria-hidden="true">✦</span></p><h1>${esc(config.title || '把日子，\n写成我们的故事。').replace(/\n/g, '<br>')}</h1><p class="hero-welcome">${esc(config.welcome || '那些一起走过的路、看过的风景，和不经意的笑容，都好好地收在这里。')}</p><a class="explore-link" href="#timeline">往下翻，故事慢慢看 <span aria-hidden="true">↓</span></a></div><div class="hero-image-wrap">${photoMarkup(config.coverId, '相册封面', 'hero-photo')}<span class="photo-tape" aria-hidden="true"></span><span class="handwriting">the days with you.</span><span class="hero-photo-number" aria-hidden="true">01 / OUR STORY</span></div><span class="hero-side-note" aria-hidden="true">SOME MOMENTS DESERVE TO LAST FOREVER</span></section>${config.stats !== false ? `<section class="stats-strip" aria-label="相册统计">${together !== null ? `<div><strong>${together.toLocaleString('zh-CN')}</strong><span>相识至今的日子</span></div>` : ''}<div><strong>${String(nodes.length).padStart(2, '0')}</strong><span>值得珍藏的故事</span></div><div><strong>${String(photoCount).padStart(2, '0')}</strong><span>定格的美好瞬间</span></div>${config.countdown !== false && birthday ? `<div class="birthday-stat"><strong>${birthday.isToday ? '生日快乐' : birthday.days}<small>${birthday.isToday ? '✦' : '天'}</small></strong><span>${birthday.isToday ? '今天的每一份美好，都属于你' : '距离下一次生日'}</span></div>` : ''}</section>` : ''}${config.stats === false && config.countdown !== false && birthday ? `<div class="birthday-banner">${birthday.isToday ? '生日快乐，愿你被所有美好温柔以待 ✦' : `距离你的生日还有 ${birthday.days} 天，期待下一个属于你的日子。`}</div>` : ''}${(preview || (birthday?.isToday && config.celebration !== false)) ? '<div class="celebration" aria-hidden="true">✧ <span>HAPPY BIRTHDAY TO YOU</span> ✧</div>' : ''}<section class="archive-section" id="timeline"><div class="section-heading"><div><p class="eyebrow">THE CHAPTERS OF US</p><h2>那些年，我们一起笑过<span>。</span></h2></div><label class="sort-label">翻阅顺序<select id="sort-order"><option value="asc">从最初的那天</option><option value="desc">从最近的回忆</option></select></label></div><div class="archive-layout"><aside class="year-sidebar"><span class="eyebrow">时光索引</span><nav id="year-nav" aria-label="按年份浏览"></nav><span class="sidebar-flower" aria-hidden="true">❧</span></aside><div id="timeline-list" class="timeline-list"></div></div></section>${config.letter ? `<details class="letter-section" id="letter"><summary><span class="letter-stamp" aria-hidden="true">DEAR<br>FRIEND</span><span class="eyebrow">A LETTER, JUST FOR YOU</span><h2>还有一些话，想对你说。</h2><span class="letter-open-hint">轻轻打开这封信 <span aria-hidden="true">↗</span></span></summary><div class="letter-body">${esc(config.letter)}</div><p class="letter-signature">以后的生日，也要一起庆祝。<span aria-hidden="true">✦</span></p></details>` : ''}<footer class="site-footer"><span class="brand-icon" aria-hidden="true">✳</span><p>把日子过成值得回望的模样。</p><small>GOOD FRIENDS, GREAT MEMORIES</small><button id="back-top" class="text-button">回到开篇 ↑</button></footer></main><dialog id="lightbox" class="lightbox" aria-label="照片浏览"><button class="lightbox-close" aria-label="关闭照片">×</button><div class="lightbox-stage"><button class="lightbox-prev" aria-label="上一张照片">‹</button><div class="lightbox-image-wrap"><img id="lightbox-image" alt=""><p id="lightbox-status" role="status"></p></div><button class="lightbox-next" aria-label="下一张照片">›</button></div><div class="lightbox-meta"><p id="lightbox-caption"></p><span id="lightbox-count"></span></div></dialog>`;
  document.documentElement.classList.toggle('motion-off', !animations);
  document.documentElement.classList.toggle('motion-on', animations);
  document.documentElement.dataset.motion = animations ? 'on' : 'off';
  if (preview || (birthday?.isToday && config.celebration !== false)) playCelebration();
  const order = document.getElementById('sort-order'); order.value = config.order === 'desc' ? 'desc' : 'asc';
  renderTimeline(nodes, order.value);
  on(order, 'change', () => renderTimeline(nodes, order.value));
  on(document.getElementById('logout'), 'click', logout);
  transitionIn(app.querySelector('.site-header'), 650, -15);
  transitionIn(app.querySelector('.hero-copy'), 1000, 30);
  on(document.getElementById('letter'), 'toggle', event => { if(event.currentTarget.open && animations) event.currentTarget.querySelector('.letter-body').animate([{opacity:0},{opacity:1}],{duration:400,easing:'ease-out'}); });
  on(app, 'click', event => {
    const link=event.target.closest('a[href^="#"]');
    if(!link || !content) return;
    const target=document.getElementById(link.getAttribute('href').slice(1));
    if(!target) return;
    event.preventDefault();
    history.replaceState(null,'',link.getAttribute('href'));
    const offset=parseFloat(getComputedStyle(target).scrollMarginTop)||0;
    scrollToPosition(window.scrollY+target.getBoundingClientRect().top-offset);
    if(target.classList.contains('year-group')) transitionIn(target.querySelector('.year-heading'),700,16);
  });

  on(document.getElementById('music-toggle'), 'click', toggleMusic);
  on(document.getElementById('music-volume'), 'input', event => { if (audio) audio.volume = Number(event.target.value); });
  on(document.getElementById('back-top'), 'click', () => scrollToPosition(0));
  on(window, 'scroll', updateProgress, { passive: true });
  const dialog = document.getElementById('lightbox');
  on(dialog.querySelector('.lightbox-close'), 'click', closeLightbox);
  on(dialog.querySelector('.lightbox-prev'), 'click', () => showLightbox(lightboxIndex - 1));
  on(dialog.querySelector('.lightbox-next'), 'click', () => showLightbox(lightboxIndex + 1));
  on(dialog, 'cancel', event => { event.preventDefault(); closeLightbox(); });
  on(dialog, 'click', event => { if (event.target === dialog) closeLightbox(); });
  on(dialog, 'keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); showLightbox(lightboxIndex + (event.key === 'ArrowLeft' ? -1 : 1)); } });
  let touchX = null;
  on(dialog, 'touchstart', event => { touchX = event.touches[0].clientX; }, { passive: true });
  on(dialog, 'touchend', event => { if (touchX !== null) { const dx = event.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 55) showLightbox(lightboxIndex + (dx > 0 ? -1 : 1)); touchX = null; } }, { passive: true });
  observeImages(); updateProgress();
}
function renderTimeline(nodes, order) {
  observer?.disconnect(); sectionObserver?.disconnect(); revealObserver?.disconnect(); lightboxItems = [];
  const sorted = sortNodes([...nodes], order), years = [], groups = new Map();
  sorted.forEach(node => { const year = dateParts(node.date).year; if (!groups.has(year)) { years.push(year); groups.set(year, []); } groups.get(year).push(node); });
  document.getElementById('year-nav').innerHTML = years.map((year, i) => `<a href="#year-${i}" class="year-link${i === 0 ? ' active' : ''}">${esc(year)}<span>${String(groups.get(year).length).padStart(2, '0')}</span></a>`).join('');
  document.getElementById('timeline-list').innerHTML = years.length ? years.map((year, yearIndex) => `<section class="year-group" id="year-${yearIndex}" data-year-index="${yearIndex}"><h3 class="year-heading">${esc(year)}<span>THE MEMORIES</span></h3>${groups.get(year).map(node => {
    const date = dateParts(node.date), photos = Array.isArray(node.photos) ? node.photos : [];
    const pictures = photos.map(photo => { const index = lightboxItems.length; lightboxItems.push({ id: photo.id, caption: photo.caption || node.title || '', date: date.full }); return `<button class="memory-photo-button${photo.id === node.coverId ? ' is-cover' : ''}" data-lightbox="${index}" aria-label="查看照片：${esc(photo.caption || node.title || '回忆照片')}">${photoMarkup(photo.id, photo.caption || node.title || '回忆照片')}<span class="photo-expand" aria-hidden="true">↗</span>${photo.caption ? `<span class="photo-caption">${esc(photo.caption)}</span>` : ''}</button>`; }).join('');
    return `<article class="memory-card${node.important ? ' is-important' : ''}"><div class="memory-date"><strong>${esc(date.month)}<span>/</span>${esc(date.day)}</strong><span>${esc(node.time || date.year)}</span></div><div class="memory-content"><div class="memory-meta">${node.important ? '<span class="important-badge">✧ 特别珍藏</span>' : ''}${node.location ? `<span class="location">⌖ ${esc(node.location)}</span>` : ''}</div><h4>${esc(node.title || '一个平凡而美好的日子')}</h4>${node.text ? `<p class="memory-text">${esc(node.text)}</p>` : ''}${pictures ? `<div class="memory-photos photos-${Math.min(photos.length, 3)}">${pictures}</div>` : node.coverId ? `<div class="memory-photos photos-1">${photoMarkup(node.coverId, node.title || '回忆封面')}</div>` : ''}${node.tags ? `<div class="memory-tags">${String(node.tags).split(/[,，、\n#]+/).map(tag => tag.trim()).filter(Boolean).map(tag => `<span># ${esc(tag)}</span>`).join('')}</div>` : ''}</div></article>`;
  }).join('')}</section>`).join('') : '<div class="empty-state"><span aria-hidden="true">❧</span><h3>故事，正要开始。</h3><p>这里还没有回忆。愿往后的日子，都有值得珍藏的瞬间。</p></div>';
  app.querySelectorAll('[data-lightbox]').forEach(button => on(button, 'click', () => showLightbox(Number(button.dataset.lightbox))));
  if ('IntersectionObserver' in window) { sectionObserver = new IntersectionObserver(entries => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top); if (!visible.length) return; const index = visible[0].target.dataset.yearIndex; app.querySelectorAll('.year-link').forEach((link, i) => { link.classList.toggle('active', String(i) === index); if (String(i) === index) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); }); }, { rootMargin: '-15% 0px -55% 0px' }); app.querySelectorAll('.year-group').forEach(section => sectionObserver.observe(section)); }
  observeImages();
  observeCards();
}
let lightboxRequest = 0, lastFocus;
async function showLightbox(index) {
  if (!lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex], dialog = document.getElementById('lightbox'), image = document.getElementById('lightbox-image'), status = document.getElementById('lightbox-status');
  const request = ++lightboxRequest, epoch = generation;
  if (!dialog.open) { lastFocus = document.activeElement; dialog.showModal(); transitionIn(dialog,450,12); document.body.classList.add('lightbox-open'); }
  image.removeAttribute('src'); image.alt = item.caption || '回忆照片'; status.textContent = '正在展开这份回忆…';
  document.getElementById('lightbox-caption').textContent = item.caption || item.date;
  document.getElementById('lightbox-count').textContent = `${lightboxIndex + 1} / ${lightboxItems.length}`;
  dialog.querySelectorAll('.lightbox-prev,.lightbox-next').forEach(button => { button.disabled = lightboxItems.length < 2; });
  try { const url = await assetUrl(item.id); if (request !== lightboxRequest || epoch !== generation || !dialog.open) return; image.onload = () => { status.textContent = ''; transitionIn(image,500,10); }; image.onerror = () => { status.textContent = '这张照片暂时无法打开，可以继续翻阅。'; }; image.src = url; }
  catch { if (request === lightboxRequest && epoch === generation) status.textContent = '这张照片暂时无法打开，可以继续翻阅。'; }
}
function closeLightbox() {
  lightboxRequest++;
  const restore = lastFocus;
  lastFocus = null;
  const dialog = document.getElementById('lightbox');
  dialog?.close();
  document.getElementById('lightbox-image')?.removeAttribute('src');
  document.body.classList.remove('lightbox-open');
  if (restore?.isConnected) restore.focus();
}
async function toggleMusic() {
  if (musicLoading) return;
  const button = document.getElementById('music-toggle'), label = document.getElementById('music-label'), epoch = generation;
  if (audio && !audio.paused) { audio.pause(); button.setAttribute('aria-pressed', 'false'); label.textContent = '放一首熟悉的歌'; return; }
  musicLoading = true; button.disabled = true; label.textContent = '正在准备音乐…';
  try {
    if (!audio) { const url = await assetUrl(content.config.musicId); if (epoch !== generation) return; audio = new Audio(url); audio.loop = true; audio.volume = Number(document.getElementById('music-volume').value); on(audio, 'error', () => { if (epoch === generation) { button.setAttribute('aria-pressed', 'false'); label.textContent = '放一首熟悉的歌'; toast('音乐暂时无法播放，回忆依然可以继续。'); } }); }
    await audio.play(); if (epoch !== generation) return; button.setAttribute('aria-pressed', 'true'); label.textContent = '暂停这首歌';
  } catch { if (epoch === generation) { label.textContent = '放一首熟悉的歌'; toast('音乐暂时无法播放，请稍后再试。'); } }
  finally { if (epoch === generation) { musicLoading = false; button.disabled = false; } }
}
function updateProgress() { const bar = document.getElementById('reading-bar'); if (bar) { const total = document.documentElement.scrollHeight - window.innerHeight; bar.style.width = `${total > 0 ? Math.min(100, window.scrollY / total * 100) : 0}%`; } }
function logout() { closeLightbox(); manifest = undefined; loginView(); location.hash = 'login'; window.scrollTo(0, 0); }

/** Mount the read-only viewer. assetResolver(assetId) must return a Blob or Promise<Blob>.
 * Set window.__BIRTHDAY_PREVIEW__ = true before importing this module to suppress login and manifest fetching.
 * Returns a disposer; the caller owns source blobs, this viewer owns and revokes all generated object URLs.
 */
export function mountPreview(previewContent, assetResolver) {
  if (!previewContent || typeof assetResolver !== 'function') throw new TypeError('mountPreview requires content and an asset resolver');
  mount(previewContent, assetResolver, true); const epoch = generation;
  return () => { if (generation === epoch) dispose(); };
}
if (!window.__BIRTHDAY_PREVIEW__) {
  window.addEventListener('hashchange', () => {
    if (preview) return;
    if (location.hash === '#login' && content) { logout(); return; }
    if (!content && location.hash !== '#login') { location.replace('#login'); }
    else if (content && location.hash === '#memories') window.scrollTo({ top: 0, behavior: animations ? 'smooth' : 'instant' });
  });
  loginView(); if (location.hash !== '#login') location.replace('#login');
}
window.addEventListener('pagehide', () => { dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted && !window.__BIRTHDAY_PREVIEW__) { manifest = undefined; loginView(); if (location.hash !== '#login') location.replace('#login'); } });
