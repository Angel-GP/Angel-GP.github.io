/* =========================================================
 * Markdown 渲染：markdown-it + 自定义 [[双链]] 插件 + 标题锚点
 * ========================================================= */
const Render = (() => {
  const md = window.markdownit({
    html: false,   // 禁用原始 HTML，防 XSS
    linkify: true,
    breaks: false
  });

  /* ---------- 标题自动生成 id（用于目录锚点） ---------- */
  let slugCounts = {};
  function slugify(s){
    return String(s || "").trim().toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  }
  function uniqueSlug(base){
    if (!slugCounts[base]){ slugCounts[base] = 1; return base; }
    slugCounts[base]++;
    return base + "-" + slugCounts[base];
  }
  const defaultHeadingOpen = md.renderer.rules.heading_open ||
    ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.heading_open = (tokens, idx, opts, env, self) => {
    const inline = tokens[idx + 1];
    const text = inline && inline.content ? inline.content : "";
    tokens[idx].attrSet("id", uniqueSlug(slugify(text)));
    return defaultHeadingOpen(tokens, idx, opts, env, self);
  };

  /* ---------- 外链新窗口打开 ---------- */
  const defaultLinkOpen = md.renderer.rules.link_open ||
    ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const href = tokens[idx].attrGet("href") || "";
    if (/^https?:/i.test(href)){
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  /* ---------- [[Wiki 双链]] 插件 ----------
   * 语法：[[页面路径]] 或 [[页面路径|显示文字]]
   * 链接是否"存在"由 window.WikiResolver 判定（app.js 提供，基于页面索引）
   */
  function wikilinkPlugin(mdInstance){
    mdInstance.inline.ruler.before("link", "wikilink", (state, silent) => {
      if (state.src.charCodeAt(state.pos) !== 0x5B) return false;      // [
      if (state.src.charCodeAt(state.pos + 1) !== 0x5B) return false;  // [
      const m = state.src.slice(state.pos).match(/^\[\[([^\[\]\|]+)(?:\|([^\[\]]+))?\]\]/);
      if (!m) return false;
      if (silent) return true;

      const target = m[1].trim();
      const alias = (m[2] || "").trim();
      const res = window.WikiResolver
        ? window.WikiResolver(target)
        : { path: target, exists: null, title: target.split("/").pop() };

      const token = state.push("wikilink_open", "a", 1);
      token.attrSet("href", "#/p/" + res.path.split("/").map(encodeURIComponent).join("/"));
      let cls = "wikilink";
      if (res.exists === false){
        cls += " wikilink-missing";
        token.attrSet("title", "页面不存在，点击创建");
      }
      token.attrSet("class", cls);

      const textToken = state.push("text", "", 0);
      textToken.content = alias || res.title || target;
      state.push("wikilink_close", "a", -1);
      state.pos = state.pos + m[0].length;
      return true;
    });
  }
  md.use(wikilinkPlugin);

  function render(mdText){
    slugCounts = {};
    return md.render(mdText || "");
  }

  return { render };
})();
