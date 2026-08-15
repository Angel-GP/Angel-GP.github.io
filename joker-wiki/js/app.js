/* =========================================================
 * Joker Wiki 主逻辑（Supabase 版）
 * 路由（hash）：#/p/<页面路径>
 * ========================================================= */
(() => {
"use strict";

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const contentEl = $("content"), treeEl = $("page-tree"), tocEl = $("toc"),
  headerActions = $("header-actions"), breadcrumbsEl = $("breadcrumbs"),
  searchInput = $("search-input"), fulltextCheck = $("fulltext-check"),
  modalRoot = $("modal-root"), toastRoot = $("toast-root"),
  brandTitle = $("brand-title"), brandSub = $("brand-sub"),
  brandLogo = document.querySelector(".brand-logo"), userArea = $("user-area");

/* ---------- 状态 ---------- */
const state = {
  settings: Object.assign({}, window.WIKI_CONFIG || {}),
  user: null,        // Supabase 登录用户
  theme: "light",
  index: { pages: [], byPath: new Map(), byBase: new Map() },
  indexLoaded: false,
  current: null,     // {path, content}
  historyRef: null,  // 正在查看的历史版本 id
  viewMode: "view",  // view | edit
  editText: "",
  searching: false
};

/* ---------- 工具 ---------- */
function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function toast(msg, type){
  const el = document.createElement("div");
  el.className = "toast " + (type || "info");
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 4000);
}
function fmtDate(iso){
  return new Date(iso).toLocaleString("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function relTime(iso){
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + " 分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " 小时前";
  const d = Math.floor(h / 24);
  if (d < 30) return d + " 天前";
  return fmtDate(iso);
}
const isLoggedIn = () => !!state.user;
/* 页面所有权：无主页面（未认领）可编辑，有主页面仅创建者可编辑 */
const canEdit = (p) => !!(state.user && p && (p.ownerId == null || p.ownerId === state.user.id));
const isPlaceholder = () => {
  const s = state.settings.supabase || {};
  return !s.url || !s.anonKey || /YOUR-PROJECT|YOUR-ANON/.test(s.url + s.anonKey);
};

/* ---------- 主题 ---------- */
function applyTheme(){
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("jw.theme", state.theme);
  $("btn-theme").textContent = state.theme === "dark" ? "☀️" : "🌙";
}

/* ---------- 配置 / 认证 ---------- */
function loadConfig(){
  state.settings = Object.assign({}, window.WIKI_CONFIG || {});
  state.theme = localStorage.getItem("jw.theme") ||
    (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  API.configure(state.settings);
  brandTitle.textContent = state.settings.title || "Wiki";
  brandSub.textContent = state.settings.subtitle || "";
  brandLogo.textContent = state.settings.logo || "📓";
  document.title = state.settings.title || "Wiki";
  // 恢复登录会话
  API.onAuthChange((user) => { state.user = user; renderUserArea(); });
  API.getSession().then((user) => { state.user = user; renderUserArea(); });
}
function renderUserArea(){
  if (!userArea) return;
  if (state.user){
    userArea.innerHTML = `<button class="user-chip" id="btn-user" title="点击退出登录">👤 ${esc(state.user.email || "已登录")}</button>`;
    $("btn-user").onclick = confirmLogout;
  } else {
    userArea.innerHTML = `<button class="user-chip guest" id="btn-user" title="登录后可编辑">👤 登录</button>`;
    $("btn-user").onclick = () => openLogin();
  }
  // 登录状态影响编辑按钮显示，刷新页头
  if (state.viewMode === "view" && state.current) renderHeader();
}
function confirmLogout(){
  if (!confirm("退出登录？")) return;
  API.signOut().then(() => { state.user = null; renderUserArea(); toast("已退出登录"); });
}

/* ---------- 登录弹窗 ---------- */
function openLogin(){
  if (isPlaceholder()){
    toast("Supabase 尚未配置，请联系管理员", "error");
    return;
  }
  showModal(`<div class="modal"><div class="modal-head"><span>🔐 账号</span><button class="modal-close">✕</button></div>
    <div class="modal-body">
      <div class="auth-tabs">
        <button id="tab-login" class="auth-tab active">登录</button>
        <button id="tab-register" class="auth-tab">注册</button>
      </div>
      <label class="field"><span>邮箱</span><input id="au-email" type="email" required placeholder="you@example.com" autocomplete="email"></label>
      <label class="field"><span>密码（至少 6 位）</span><input id="au-pass" type="password" required minlength="6" autocomplete="current-password"></label>
      <label class="field" id="au-pass2-field" style="display:none"><span>确认密码</span><input id="au-pass2" type="password" minlength="6" autocomplete="new-password"></label>
      <div class="hint" id="au-hint">注册即可编辑所有页面；每次保存会记录你的邮箱与时间。</div>
    </div>
    <div class="modal-foot"><button class="btn btn-primary" id="au-submit">登录</button></div></div>`);
  let tab = "login";
  const setTab = (t) => {
    tab = t;
    $("tab-login").classList.toggle("active", t === "login");
    $("tab-register").classList.toggle("active", t === "register");
    $("au-pass2-field").style.display = t === "register" ? "flex" : "none";
    $("au-submit").textContent = t === "login" ? "登录" : "注册并登录";
    $("au-hint").textContent = t === "login"
      ? "登录后即可编辑所有页面。"
      : "注册即可编辑所有页面；每次保存会记录你的邮箱与时间。";
  };
  $("tab-login").onclick = () => setTab("login");
  $("tab-register").onclick = () => setTab("register");
  $("au-pass2-field").style.display = "none";
  $("au-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("au-submit").click(); });
  $("au-pass2").addEventListener("keydown", (e) => { if (e.key === "Enter") $("au-submit").click(); });
  $("au-submit").onclick = async () => {
    const email = $("au-email").value.trim();
    const pass = $("au-pass").value;
    if (!email || !pass) return toast("请填写邮箱和密码", "error");
    if (tab === "register" && pass !== $("au-pass2").value) return toast("两次输入的密码不一致", "error");
    const btn = $("au-submit");
    btn.disabled = true; btn.textContent = "请稍候…";
    try {
      if (tab === "login"){
        await API.signIn(email, pass);
        closeModal();
        toast("已登录 ✓");
      } else {
        const r = await API.signUp(email, pass);
        closeModal();
        if (r.needsConfirm) toast("注册成功！请查收验证邮件，验证后即可登录", "info");
        else toast("注册成功，已自动登录 ✓");
      }
      renderUserArea();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = tab === "login" ? "登录" : "注册并登录";
      toast(e.message, "error");
    }
  };
  $("au-email").focus();
}
function requireLogin(){
  if (isLoggedIn()) return true;
  toast("请先登录", "info");
  openLogin();
  return false;
}

/* ---------- 页面索引 ---------- */
function treeCacheKey(){ return "jw.tree.supabase.v2"; }
function readTreeCache(){
  try { return JSON.parse(localStorage.getItem(treeCacheKey()) || "null"); } catch (e) { return null; }
}
function saveTreeCache(){
  try {
    localStorage.setItem(treeCacheKey(), JSON.stringify({
      pages: state.index.pages.map(p => ({ path: p.path, ownerId: p.ownerId, ownerName: p.ownerName })), at: Date.now()
    }));
  } catch (e) {}
}
function setIndex(pages, loaded){
  state.index = { pages: [], byPath: new Map(), byBase: new Map() };
  for (const p of pages){
    const base = p.path.split("/").pop().toLowerCase();
    state.index.pages.push(p);
    state.index.byPath.set(p.path, p);
    if (!state.index.byBase.has(base)) state.index.byBase.set(base, []);
    state.index.byBase.get(base).push(p.path);
  }
  state.index.pages.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  if (loaded) state.indexLoaded = true;
  renderTree();
}
function upsertIndex(path, owner){
  const existing = state.index.byPath.get(path);
  if (existing){
    if (owner) Object.assign(existing, owner);
  } else {
    const p = Object.assign({ path }, owner || {});
    state.index.pages.push(p);
    state.index.byPath.set(path, p);
    const base = path.split("/").pop().toLowerCase();
    if (!state.index.byBase.has(base)) state.index.byBase.set(base, []);
    state.index.byBase.get(base).push(path);
    state.index.pages.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  saveTreeCache(); renderTree();
}
function removeFromIndex(path){
  state.index.pages = state.index.pages.filter(p => p.path !== path);
  state.index.byPath.delete(path);
  const base = path.split("/").pop().toLowerCase();
  const arr = state.index.byBase.get(base);
  if (arr){
    const i = arr.indexOf(path);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) state.index.byBase.delete(base);
  }
  saveTreeCache(); renderTree();
}
async function refreshTree(showToastFlag, force){
  try {
    const cached = readTreeCache();
    if (!force && cached && cached.at && cached.pages && cached.pages.length &&
        Date.now() - cached.at < 2 * 3600 * 1000){
      setIndex(cached.pages, true);
      if (showToastFlag) toast("使用本地缓存的页面列表（点 ⟳ 强制刷新）");
      return;
    }
    const pages = await API.getIndex();
    setIndex(pages, true);
    saveTreeCache();
    if (showToastFlag) toast("页面列表已刷新（共 " + pages.length + " 篇）");
    if (state.viewMode === "view" && state.current && state.current.content != null) renderView();
  } catch (e) {
    console.error(e);
    const cached = readTreeCache();
    if (cached && cached.pages && cached.pages.length){
      setIndex(cached.pages, true);
      if (showToastFlag) toast("在线刷新失败，已使用本地缓存", "error");
    } else if (showToastFlag) {
      toast(e.message, "error");
    }
  }
}

/* WikiResolver：供 markdown.js 判定 [[双链]] 目标是否存在 */
window.WikiResolver = (target) => {
  if (state.index.byPath.has(target)) return { path: target, exists: true, title: target.split("/").pop() };
  const hits = state.index.byBase.get(target.toLowerCase());
  if (hits && hits.length){
    if (hits.length === 1) return { path: hits[0], exists: true, title: hits[0].split("/").pop() };
    return { path: target, exists: null, title: target.split("/").pop() };
  }
  if (state.indexLoaded) return { path: target, exists: false, title: target.split("/").pop() };
  return { path: target, exists: null, title: target.split("/").pop() };
};

/* ---------- 侧边栏树 ---------- */
function renderTree(){
  if (state.searching) return;
  const pages = state.index.pages;
  if (!pages.length){
    treeEl.innerHTML = `<div class="tree-empty">${state.indexLoaded ? "暂无页面，点上方「＋ 新建页面」开始" : "加载中…"}</div>`;
    return;
  }
  const roots = [], folders = new Map();
  for (const p of pages){
    const i = p.path.indexOf("/");
    if (i < 0) roots.push(p);
    else {
      const dir = p.path.slice(0, i);
      if (!folders.has(dir)) folders.set(dir, []);
      folders.get(dir).push(p);
    }
  }
  let html = `<div class="tree-count">${pages.length} 个页面</div>`;
  for (const p of roots) html += treeLink(p);
  for (const [dir, list] of [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))){
    html += `<details class="tree-group" open><summary>${esc(dir)} <span class="tree-n">${list.length}</span></summary>`;
    for (const p of list) html += treeLink(p);
    html += `</details>`;
  }
  treeEl.innerHTML = html;
  highlightSidebar();
}
function treeLink(p){
  const name = p.path.split("/").pop();
  const active = state.current && state.current.path === p.path ? " active" : "";
  return `<a class="tree-item${active}" data-path="${esc(p.path)}" href="#/p/${p.path.split("/").map(encodeURIComponent).join("/")}" title="${esc(p.path)}">${esc(name)}</a>`;
}
function highlightSidebar(){
  treeEl.querySelectorAll(".tree-item").forEach(a =>
    a.classList.toggle("active", !!(state.current && a.dataset.path === state.current.path)));
}
function renderSearchResults(results, query){
  treeEl.innerHTML =
    `<div class="tree-count">找到 ${results.length} 个结果：${esc(query)}</div>` +
    (results.map(r => `<a class="tree-item" href="#/p/${r.path.split("/").map(encodeURIComponent).join("/")}">
        <span>${esc(r.path.split("/").pop())}</span>
        <span class="tree-snippet">${r.snippet ? esc(r.snippet) : esc(r.path)}</span>
      </a>`).join("") || `<div class="tree-empty">无匹配结果</div>`);
}

/* ---------- 搜索 ---------- */
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
async function handleSearch(){
  const q = searchInput.value.trim();
  if (!q){ state.searching = false; renderTree(); return; }
  if (!state.indexLoaded){
    toast("页面列表尚未加载，正在获取…");
    await refreshTree(false, true);
  }
  if (!fulltextCheck.checked){
    state.searching = true;
    const re = new RegExp(escapeRegExp(q), "i");
    renderSearchResults(state.index.pages.filter(p => re.test(p.path)), q);
  } else {
    state.searching = true;
    toast("全文搜索中（首次较慢）…");
    const re = new RegExp(escapeRegExp(q), "ig");
    const results = [];
    const queue = [...state.index.pages];
    const n = Math.min(6, Math.max(1, queue.length));
    async function worker(){
      while (queue.length){
        const p = queue.shift();
        try {
          const c = await API.readPage(p.path);
          re.lastIndex = 0;
          const m = re.exec(c);
          if (m){
            const start = Math.max(0, m.index - 30);
            results.push({ path: p.path, snippet: c.slice(start, m.index + q.length + 40).replace(/\s+/g, " ") });
          }
        } catch (e) {}
      }
    }
    await Promise.all(Array.from({ length: n }, worker));
    renderSearchResults(results, q);
  }
}

/* ---------- 路由 / 页面 ---------- */
function route(){
  const raw = location.hash.replace(/^#\/?/, "");
  let h = raw;
  try { h = decodeURIComponent(raw); } catch (e) {}
  if (!h){ showPage(state.settings.homePage || "Home"); return; }
  const parts = h.split("/");
  if (parts[0] === "p" && parts.length > 1) showPage(parts.slice(1).join("/"));
  else showPage(h);
}
async function showPage(path, ref){
  window.removeEventListener("beforeunload", beforeUnload);
  state.viewMode = "view";
  state.historyRef = ref || null;
  state.current = Object.assign({ path }, state.index.byPath.get(path) || {});
  $("main").scrollTop = 0;
  tocEl.innerHTML = "";
  renderHeader();
  setContentLoading();
  try {
    const content = await API.readPage(path, ref);
    if (state.current && state.current.path !== path) return; // 竞态保护
    state.current.content = content;
    renderView();
  } catch (e) {
    if (state.current && state.current.path !== path) return;
    if (e.message === "PAGE_NOT_FOUND") renderNotFound(path);
    else renderError(e.message);
  }
  highlightSidebar();
  document.title = (path.split("/").pop() || "Wiki") + " · " + (state.settings.title || "Wiki");
}
function setContentLoading(){
  contentEl.innerHTML = `<div class="loading"><div class="spinner"></div><div>加载中…</div></div>`;
}
function renderHeader(){
  const p = state.current;
  if (!p) return;
  const parts = p.path.split("/");
  let bc = `<a class="crumb" href="#/">首页</a>`;
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++){
    acc += (acc ? "/" : "") + parts[i];
    bc += `<span class="crumb-sep">/</span><a class="crumb" href="#/p/${acc.split("/").map(encodeURIComponent).join("/")}">${esc(parts[i])}</a>`;
  }
  bc += `<span class="crumb-sep">/</span><span class="crumb-cur">${esc(parts[parts.length - 1])}</span>`;
  breadcrumbsEl.innerHTML = bc;

  if (state.viewMode === "view"){
    if (state.historyRef){
      headerActions.innerHTML =
        `<button class="btn btn-sm" id="btn-back-latest">← 返回最新版本</button>
         <button class="btn btn-sm btn-primary" id="btn-restore">恢复此版本到编辑器</button>`;
      $("btn-back-latest").onclick = () => showPage(p.path);
      $("btn-restore").onclick = () => {
        if (!requireLogin()) return;
        if (!canEdit(p)) return toast("🔒 只能编辑自己创建的页面", "error");
        restoreFromHistory();
      };
    } else if (canEdit(p)){
      headerActions.innerHTML =
        `<button class="btn btn-sm btn-primary" id="btn-edit">✏️ 编辑</button>
         <button class="btn btn-sm" id="btn-history">🕘 历史</button>
         <button class="btn btn-sm" id="btn-backlinks">🔗 反向链接</button>
         <button class="btn btn-sm icon-only" id="btn-copy" title="复制本页链接">⧉</button>`;
      $("btn-edit").onclick = () => { if (requireLogin()) startEdit(); };
      $("btn-history").onclick = () => openHistory();
      $("btn-backlinks").onclick = () => openBacklinks();
      $("btn-copy").onclick = copyLink;
    } else {
      headerActions.innerHTML =
        `<span class="editing-tag" title="仅页面创建者可编辑">🔒 只读</span>
         <button class="btn btn-sm" id="btn-history">🕘 历史</button>
         <button class="btn btn-sm" id="btn-backlinks">🔗 反向链接</button>
         <button class="btn btn-sm icon-only" id="btn-copy" title="复制本页链接">⧉</button>`;
      $("btn-history").onclick = () => openHistory();
      $("btn-backlinks").onclick = () => openBacklinks();
      $("btn-copy").onclick = copyLink;
    }
  } else {
    headerActions.innerHTML = `<span class="editing-tag">编辑中</span>`;
  }
}
function renderView(){
  const html = Render.render(state.current.content, state.current.path);
  let top = "";
  if (isPlaceholder()) top +=
    `<div class="banner warn"><strong>Supabase 尚未配置：</strong>请在 <code>js/config.js</code> 填入 <code>supabase.url</code> 与 <code>supabase.anonKey</code>（详细步骤见 README），然后重新推送。</div>`;
  if (state.historyRef) top +=
    `<div class="banner hist">📜 正在查看历史版本 <code>#${esc(String(state.historyRef).slice(0, 7))}</code>（只读），点右上角可恢复。</div>`;
  const ownerNote = (state.current && state.current.ownerName)
    ? `<div class="page-owner">✍️ 创建者：${esc(state.current.ownerName)}</div>` : "";
  contentEl.innerHTML = `<article class="markdown-body">${top}${html}${ownerNote}</article>`;
  buildTOC();
}
function buildTOC(){
  const hs = contentEl.querySelectorAll(".markdown-body h2, .markdown-body h3");
  if (hs.length < 2){ tocEl.innerHTML = ""; return; }
  let html = `<div class="toc-title">本页目录</div>`;
  hs.forEach(h => {
    html += `<a class="toc-item toc-${h.tagName.toLowerCase()}" href="#${h.id}">${esc(h.textContent)}</a>`;
  });
  tocEl.innerHTML = html;
}
function renderNotFound(path){
  contentEl.innerHTML = `<div class="empty-page">
    <div class="empty-icon">📄</div>
    <h2>页面不存在</h2>
    <p><code>${esc(path)}</code></p>
    ${state.indexLoaded ? "" : `<p class="hint">页面索引尚未加载完成，可稍后刷新重试</p>`}
    <div class="empty-actions">
      <button class="btn btn-primary" id="btn-create-missing">创建这个页面</button>
      <a class="btn" href="#/">返回首页</a>
    </div>
  </div>`;
  $("btn-create-missing").onclick = () => { if (requireLogin()) openNewPageModal(path); };
}
function renderError(msg){
  contentEl.innerHTML = `<div class="empty-page">
    <div class="empty-icon">⚠️</div><h2>出错了</h2>
    <p class="error">${esc(msg)}</p>
    <div class="empty-actions"><button class="btn" onclick="location.reload()">刷新重试</button><a class="btn" href="#/">返回首页</a></div>
  </div>`;
}

/* ---------- 编辑 ---------- */
function beforeUnload(e){
  if (state.viewMode === "edit" && state.editText !== (state.current ? state.current.content || "" : "")){
    e.preventDefault();
    e.returnValue = "";
  }
}
function startEdit(initialText){
  if (!state.current) return;
  if (!canEdit(state.current)){ toast("🔒 只能编辑自己创建的页面", "error"); return; }
  state.viewMode = "edit";
  state.editText = (initialText !== undefined) ? initialText : (state.current.content || "");
  renderHeader();
  contentEl.innerHTML = `<div class="editor">
    <div class="editor-meta">${esc(state.current.path)} · <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存 · 编辑者 ${esc(state.user ? state.user.email : "")}</div>
    <textarea id="editor-area" spellcheck="false" placeholder="在此输入 Markdown…">${esc(state.editText)}</textarea>
    <div id="editor-preview" class="markdown-body preview" style="display:none"></div>
    <div class="editor-actions">
      <button class="btn btn-primary" id="btn-save">保存</button>
      <button class="btn" id="btn-preview">预览</button>
      <button class="btn" id="btn-cancel">取消</button>
      <button class="btn btn-danger-ghost" id="btn-delete">删除页面</button>
    </div>
  </div>`;
  const area = $("editor-area");
  area.addEventListener("input", () => { state.editText = area.value; });
  area.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s"){ e.preventDefault(); saveEdit(); }
  });
  $("btn-save").onclick = saveEdit;
  $("btn-cancel").onclick = cancelEdit;
  $("btn-delete").onclick = deleteCurrent;
  $("btn-preview").onclick = () => {
    const pv = $("editor-preview");
    if (pv.style.display === "none"){
      pv.innerHTML = Render.render(area.value, state.current.path);
      pv.style.display = "block";
      area.style.display = "none";
      $("btn-preview").textContent = "继续编辑";
    } else {
      pv.style.display = "none";
      area.style.display = "block";
      $("btn-preview").textContent = "预览";
    }
  };
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
  window.addEventListener("beforeunload", beforeUnload);
}
function cancelEdit(){
  window.removeEventListener("beforeunload", beforeUnload);
  showPage(state.current.path, state.historyRef);
}
async function saveEdit(){
  const path = state.current.path;
  const content = state.editText;
  if (!isLoggedIn()){ toast("会话已失效，请重新登录", "error"); openLogin(); return; }
  if (!canEdit(state.current)){ toast("🔒 只能编辑自己创建的页面", "error"); cancelEdit(); return; }
  const btn = $("btn-save");
  btn.disabled = true; btn.textContent = "保存中…";
  try {
    await API.savePage(path, content, "更新 " + path);
    state.current.content = content;
    upsertIndex(path, { ownerId: state.user.id, ownerName: state.user.email });
    toast("已保存 ✓");
    window.removeEventListener("beforeunload", beforeUnload);
    state.viewMode = "view";
    state.historyRef = null;
    renderHeader();
    renderView();
  } catch (e) {
    btn.disabled = false; btn.textContent = "保存";
    toast(e.message, "error");
  }
}
async function deleteCurrent(){
  const path = state.current.path;
  if (!isLoggedIn()){ toast("请先登录", "error"); openLogin(); return; }
  if (!confirm(`确定删除页面「${path}」？其历史版本也会一并删除，且不可恢复。`)) return;
  try {
    await API.deletePage(path);
    removeFromIndex(path);
    window.removeEventListener("beforeunload", beforeUnload);
    toast("已删除");
    location.hash = "";
    refreshTree();
  } catch (e) { toast(e.message, "error"); }
}

/* ---------- 历史 / 反向链接 ---------- */
async function openHistory(){
  const path = state.current.path;
  showModal(`<div class="modal"><div class="modal-head"><span>🕘 历史版本 — ${esc(path)}</span><button class="modal-close">✕</button></div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>
    <div class="modal-foot hint">最近 50 次保存记录</div></div>`);
  try {
    const list = await API.getHistory(path);
    const body = document.querySelector(".modal-body");
    body.innerHTML = list.length ? list.map(c => `
      <div class="hist-item">
        <div class="hist-top">
          <span class="hist-msg">${esc(c.message || "（无备注）")}</span>
          <span class="hist-sha">#${esc(String(c.sha).slice(0, 7))}</span>
        </div>
        <div class="hist-sub">${esc(c.author)} · ${relTime(c.date)}</div>
        <div class="hist-btns">
          <button class="btn btn-sm" data-view="${esc(c.sha)}">查看</button>
          <button class="btn btn-sm" data-restore="${esc(c.sha)}">恢复到编辑器</button>
        </div>
      </div>`).join("") : `<div class="tree-empty">暂无保存记录</div>`;
    body.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { closeModal(); showPage(path, b.dataset.view); });
    body.querySelectorAll("[data-restore]").forEach(b => b.onclick = () => {
      closeModal();
      if (!requireLogin()) return;
      if (!canEdit(state.current)) return toast("🔒 只能编辑自己创建的页面", "error");
      restoreFromHistory(b.dataset.restore);
    });
  } catch (e) {
    document.querySelector(".modal-body").innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}
async function restoreFromHistory(sha){
  const ref = sha || state.historyRef;
  if (!ref) return;
  try {
    toast("正在读取历史版本…");
    const content = await API.readPage(state.current.path, ref);
    startEdit(content);
    toast("已载入历史版本到编辑器，保存后将成为最新版本");
  } catch (e) { toast(e.message, "error"); }
}
async function fetchAllContents(){
  const queue = [...state.index.pages];
  const out = [];
  const n = Math.min(6, Math.max(1, queue.length));
  async function worker(){
    while (queue.length){
      const p = queue.shift();
      try { out.push({ path: p.path, content: await API.readPage(p.path) }); } catch (e) {}
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
async function openBacklinks(){
  const path = state.current.path;
  const base = path.split("/").pop().toLowerCase();
  showModal(`<div class="modal"><div class="modal-head"><span>🔗 反向链接 — ${esc(path)}</span><button class="modal-close">✕</button></div>
    <div class="modal-body"><div class="loading"><div class="spinner"></div></div></div>
    <div class="modal-foot hint">扫描全部页面的 [[双链]]，首次较慢</div></div>`);
  try {
    const docs = await fetchAllContents();
    const hits = [];
    for (const d of docs){
      if (d.path === path) continue;
      const re = /\[\[\s*([^\]|]+?)(?:\|[^\]]*?)?\s*\]\]/g;
      let m;
      while ((m = re.exec(d.content))){
        const target = m[1].trim();
        const res = window.WikiResolver(target);
        if (res.path === path || res.path.toLowerCase() === path.toLowerCase() || target.toLowerCase() === base){
          hits.push(d); break;
        }
      }
    }
    const body = document.querySelector(".modal-body");
    body.innerHTML = hits.length ? hits.map(h =>
      `<a class="backlink-item" href="#/p/${h.path.split("/").map(encodeURIComponent).join("/")}">
        <span>${esc(h.path.split("/").pop())}</span><span class="hint">${esc(h.path)}</span>
      </a>`).join("") : `<div class="tree-empty">没有页面链接到这里</div>`;
    body.querySelectorAll(".backlink-item").forEach(a => a.onclick = closeModal);
  } catch (e) {
    document.querySelector(".modal-body").innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

/* ---------- 新建页面 ---------- */
function openNewPageModal(prefill){
  if (!requireLogin()) return;
  prefill = prefill || "";
  showModal(`<div class="modal"><div class="modal-head"><span>＋ 新建页面</span><button class="modal-close">✕</button></div>
    <div class="modal-body">
      <label class="field"><span>页面路径（可用 / 分隔建层级，如 前端/React）</span>
        <input id="np-name" type="text" placeholder="例如：前端/React" value="${esc(prefill)}"></label>
      <label class="field"><span>初始内容（Markdown，可选）</span>
        <textarea id="np-content" rows="6" placeholder="可选"></textarea></label>
      <div class="hint">创建人：${esc(state.user ? state.user.email : "")}；每次保存都会记录作者与时间</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" id="np-create">创建</button>
      <button class="btn" id="np-cancel">取消</button>
    </div></div>`);
  $("np-cancel").onclick = closeModal;
  $("np-name").focus();
  $("np-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("np-create").click(); });
  $("np-create").onclick = async () => {
    let name = $("np-name").value.trim();
    let content = $("np-content").value;
    if (!name) return toast("请输入页面路径", "error");
    name = name.replace(/^\/+/, "").replace(/\.md$/i, "");
    const segs = name.split("/");
    if (segs.some(s => !s || s === "." || s === ".." || /[\\:*?"<>|#]/.test(s)))
      return toast("页面路径包含非法字符", "error");
    if (state.index.byPath.has(name)) return toast("该页面已存在：" + name, "error");
    if (!isLoggedIn()){ toast("会话已失效，请重新登录", "error"); openLogin(); return; }
    const btn = $("np-create");
    btn.disabled = true; btn.textContent = "创建中…";
    try {
      if (!content) content = `# ${name.split("/").pop()}\n\n`;
      await API.savePage(name, content, "创建 " + name);
      upsertIndex(name, { ownerId: state.user.id, ownerName: state.user.email });
      closeModal();
      toast("已创建 ✓");
      showPage(name);
    } catch (e) {
      btn.disabled = false; btn.textContent = "创建";
      toast(e.message, "error");
    }
  };
}

/* ---------- 弹窗 / 复制链接 ---------- */
function showModal(html){
  closeModal();
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = html;
  modalRoot.appendChild(ov);
  ov.querySelector(".modal-close").addEventListener("click", closeModal);
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeModal(); });
  return ov;
}
function closeModal(){ modalRoot.innerHTML = ""; }
function copyLink(){
  const url = location.href;
  const fallback = () => { prompt("复制此链接：", url); };
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(() => toast("链接已复制"), fallback);
  else fallback();
}

/* ---------- 事件绑定 / 启动 ---------- */
function closeNav(){ document.body.classList.remove("nav-open"); }
function bindEvents(){
  window.addEventListener("hashchange", route);
  window.addEventListener("hashchange", closeNav); // 点侧栏链接后自动收起菜单
  $("btn-new").onclick = () => { closeNav(); openNewPageModal(); };
  $("btn-refresh").onclick = () => refreshTree(true, true);
  $("btn-theme").onclick = () => { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); };
  $("btn-menu").onclick = () => document.body.classList.toggle("nav-open");
  $("btn-close-nav").onclick = closeNav;
  $("nav-backdrop").onclick = closeNav;
  searchInput.addEventListener("input", () => { if (!fulltextCheck.checked) handleSearch(); });
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); handleSearch(); } });
  fulltextCheck.addEventListener("change", () => { if (searchInput.value.trim()) handleSearch(); });
  contentEl.addEventListener("click", (e) => {
    const a = e.target.closest("a.wikilink-missing");
    if (!a) return;
    e.preventDefault();
    let path = a.getAttribute("href").replace(/^#\/p\//, "");
    try { path = decodeURIComponent(path); } catch (err) {}
    openNewPageModal(path);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function init(){
  if (!window.markdownit || !window.supabase){
    contentEl.innerHTML = `<div class="empty-page"><div class="empty-icon">⚠️</div>
      <h2>依赖库加载失败</h2><p class="error">请确认 lib/markdown-it.min.js 与 lib/supabase.min.js 文件存在。</p></div>`;
    return;
  }
  loadConfig();
  applyTheme();
  bindEvents();
  renderTree();
  refreshTree(false);
  route();
}
init();
})();
