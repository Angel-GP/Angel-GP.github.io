/* =========================================================
 * GitHub API 封装（纯前端，无服务器）
 * - 浏览内容走 raw.githubusercontent.com（CDN，无 API 限额）
 * - 列表 / 写入 / 历史走 api.github.com
 * ========================================================= */
const API = (() => {
  let settings = null;
  let token = "";
  const memCache = new Map(); // path@ref -> 内容

  function configure(s, t){ settings = s; token = t || ""; }

  function headers(){
    const h = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  const encSeg = (s) => String(s).split("/").map(encodeURIComponent).join("/");
  const apiUrl = (p) => `https://api.github.com/repos/${encSeg(settings.owner)}/${encSeg(settings.repo)}${p}`;
  const rawUrl = (path, ref) =>
    `https://raw.githubusercontent.com/${encSeg(settings.owner)}/${encSeg(settings.repo)}/${encSeg(ref || settings.branch)}/${encSeg(settings.wikiDir)}/${encSeg(path)}.md`;
  const filePath = (path) => `${settings.wikiDir}/${path}.md`;

  async function fetchJson(url, opts, allow404){
    const res = await fetch(url, opts);
    if (res.ok) return res.json();
    if (allow404 && res.status === 404) return null;
    if (res.status === 401) throw new Error("GitHub Token 无效或无权限（需要本仓库 Contents 的读写权限）");
    if (res.status === 403 || res.status === 429) throw new Error("GitHub API 请求受限：未配置 Token 时限额 60 次/小时，请在 ⚙ 设置中配置 Token");
    throw new Error("请求失败：" + res.status + " " + res.statusText);
  }

  /* ---------- 页面索引 ---------- */
  async function getIndex(){
    try {
      const data = await fetchJson(apiUrl(`/git/trees/${settings.branch}?recursive=1`), { headers: headers() });
      return parseTree(data.tree);
    } catch (e) {
      if (e.message.includes("受限") || e.message.includes("Token")) throw e;
      // 回退：jsDelivr 文件列表（无 sha，有 CDN 缓存延迟）
      return parseTree(await jsdelivrList());
    }
  }
  async function jsdelivrList(){
    const url = `https://data.jsdelivr.com/v1/packages/gh/${encSeg(settings.owner)}/${encSeg(settings.repo)}@${encSeg(settings.branch)}?structure=flat`;
    const data = await fetchJson(url, {});
    return (data.files || []).map(f => ({ path: f.name, type: "blob" }));
  }
  function parseTree(tree){
    const prefix = settings.wikiDir.replace(/\/+$/, "") + "/";
    return (tree || [])
      .filter(t => t.type === "blob" && t.path.startsWith(prefix) && t.path.toLowerCase().endsWith(".md"))
      .map(t => ({ path: t.path.slice(prefix.length, -3), sha: t.sha || null }));
  }

  /* ---------- 读取页面（raw CDN，不走 API 限额） ---------- */
  async function readPage(path, ref){
    const key = path + "@" + (ref || settings.branch);
    if (memCache.has(key)) return memCache.get(key);
    const res = await fetch(rawUrl(path, ref), { cache: "no-store" });
    if (res.status === 404) throw new Error("PAGE_NOT_FOUND");
    if (!res.ok) throw new Error("读取页面失败：" + res.status);
    const text = await res.text();
    memCache.set(key, text);
    return text;
  }
  function setCached(path, content, ref){
    memCache.set(path + "@" + (ref || settings.branch), content);
  }

  /* ---------- 写入 ---------- */
  function utf8ToBase64(str){
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  async function getSha(path){
    const data = await fetchJson(
      apiUrl(`/contents/${encodeURIComponent(filePath(path))}?ref=${encodeURIComponent(settings.branch)}`),
      { headers: headers() }, true);
    return data ? data.sha : null;
  }
  async function savePage(path, content, message, sha){
    const body = { message, content: utf8ToBase64(content), branch: settings.branch };
    if (sha) body.sha = sha;
    const data = await fetchJson(apiUrl(`/contents/${encodeURIComponent(filePath(path))}`), {
      method: "PUT", headers: headers(), body: JSON.stringify(body)
    });
    return data.content.sha;
  }
  async function deletePage(path, sha, message){
    await fetchJson(apiUrl(`/contents/${encodeURIComponent(filePath(path))}`), {
      method: "DELETE", headers: headers(), body: JSON.stringify({ message, sha, branch: settings.branch })
    });
  }

  /* ---------- 历史 ---------- */
  async function getHistory(path){
    const data = await fetchJson(
      apiUrl(`/commits?path=${encodeURIComponent(filePath(path))}&sha=${encodeURIComponent(settings.branch)}&per_page=30`),
      { headers: headers() });
    return data.map(c => ({
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.author.date,
      author: c.commit.author.name
    }));
  }

  return { configure, getIndex, readPage, setCached, getSha, savePage, deletePage, getHistory };
})();
