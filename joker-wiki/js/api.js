/* =========================================================
 * Supabase 数据层 + 认证（纯前端）
 * - 页面内容存 Supabase PostgreSQL（pages / revisions 表）
 * - 写入统一走 RPC（save_page / delete_page），由数据库 RLS 保证安全
 * - 对外接口与原 GitHub 版保持一致（getIndex / readPage / savePage …）
 * ========================================================= */
const API = (() => {
  let sb = null;                 // Supabase 客户端
  const memCache = new Map();    // path@latest -> 内容

  function configure(settings){
    const s = settings && settings.supabase;
    if (window.supabase && s && s.url && s.anonKey &&
        !/YOUR-PROJECT|YOUR-ANON/.test(s.url + s.anonKey)){
      sb = window.supabase.createClient(s.url, s.anonKey);
    } else {
      sb = null;
    }
  }
  function ready(){
    if (!sb) throw new Error("Supabase 未配置：请先在 js/config.js 填入 supabase.url 与 supabase.anonKey，并推送更新");
    return sb;
  }

  /* ---------- 认证 ---------- */
  function onAuthChange(cb){
    if (!sb) return { subscription: { unsubscribe(){} } };
    return ready().auth.onAuthStateChange((event, session) => cb(session ? session.user : null, event));
  }
  async function getSession(){
    if (!sb) return null;
    const { data } = await ready().auth.getSession();
    return data.session ? data.session.user : null;
  }
  async function signUp(email, password){
    // 明确指定验证邮件点击后跳回的地址（避免默认 localhost）
    const redirectTo = location.origin + location.pathname;
    const { data, error } = await ready().auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw new Error(mapAuthError(error));
    return { user: data.user, needsConfirm: !data.session };
  }
  async function signIn(email, password){
    const { data, error } = await ready().auth.signInWithPassword({ email, password });
    if (error) throw new Error(mapAuthError(error));
    return data.user;
  }
  async function signOut(){
    if (sb) await sb.auth.signOut();
  }
  function mapAuthError(e){
    const m = e.message || "";
    if (/Invalid login credentials/i.test(m)) return "邮箱或密码错误";
    if (/User already registered/i.test(m)) return "该邮箱已注册，请切换到「登录」";
    if (/at least \d+ characters/i.test(m)) return "密码至少 6 位";
    if (/Email not confirmed/i.test(m)) return "邮箱尚未验证，请查收验证邮件";
    if (/rate limit/i.test(m)) return "操作太频繁，请稍后再试";
    return "认证失败：" + m;
  }

  /* ---------- 页面索引 ---------- */
  async function getIndex(){
    const { data, error } = await ready().from("pages").select("path, owner_id, owner_name");
    if (error){
      // 兼容：数据库尚未执行所有权迁移时，退回只查路径
      const { data: d2, error: e2 } = await ready().from("pages").select("path");
      if (e2) throw new Error("读取页面列表失败：" + e2.message);
      return (d2 || []).map(p => ({ path: p.path, sha: null, ownerId: null, ownerName: null }));
    }
    return (data || []).map(p => ({
      path: p.path, sha: null,
      ownerId: p.owner_id || null,
      ownerName: p.owner_name || null
    }));
  }

  /* ---------- 读取页面 ---------- */
  async function readPage(path, ref){
    if (ref){
      // 历史版本：按 revision id 读取
      const { data, error } = await ready()
        .from("revisions").select("content").eq("path", path).eq("id", ref).maybeSingle();
      if (error) throw new Error("读取历史版本失败：" + error.message);
      if (!data) throw new Error("PAGE_NOT_FOUND");
      return data.content;
    }
    const key = path + "@latest";
    if (memCache.has(key)) return memCache.get(key);
    const { data, error } = await ready()
      .from("pages").select("content").eq("path", path).maybeSingle();
    if (error) throw new Error("读取页面失败：" + error.message);
    if (!data) throw new Error("PAGE_NOT_FOUND");
    memCache.set(key, data.content);
    return data.content;
  }
  function setCached(path, content){
    memCache.set(path + "@latest", content);
  }

  /* ---------- 写入 ---------- */
  async function getSha(){ return null; } // Supabase 无需 sha（保留接口兼容）
  async function savePage(path, content, message){
    const { error } = await ready().rpc("save_page", { p_path: path, p_content: content, p_message: message || "" });
    if (error) throw new Error("保存失败：" + (error.message || "").replace(/^permission denied:\s*/i, ""));
    setCached(path, content);
    return null;
  }
  async function deletePage(path){
    const { error } = await ready().rpc("delete_page", { p_path: path });
    if (error) throw new Error("删除失败：" + (error.message || "").replace(/^permission denied:\s*/i, ""));
    memCache.delete(path + "@latest");
  }

  /* ---------- 历史 ---------- */
  async function getHistory(path){
    const { data, error } = await ready()
      .from("revisions")
      .select("id, message, author_name, created_at")
      .eq("path", path)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("读取历史失败：" + error.message);
    return (data || []).map(r => ({
      sha: String(r.id),
      message: r.message,
      date: r.created_at,
      author: r.author_name || "未知"
    }));
  }

  return {
    configure, onAuthChange, getSession, signUp, signIn, signOut,
    getIndex, readPage, setCached, getSha, savePage, deletePage, getHistory
  };
})();
