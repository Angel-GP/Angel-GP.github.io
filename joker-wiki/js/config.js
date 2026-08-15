/* =========================================================
 * 站点配置
 * supabase.url / supabase.anonKey 需要在 Supabase 控制台创建项目后填入。
 * anon key 是"公开密钥"，本来就设计为可暴露在前端页面中；
 * 真正的数据安全由数据库的行级安全策略（RLS）在 Supabase 服务端保证。
 * ========================================================= */
window.WIKI_CONFIG = {
  supabase: {
    url: "https://YOUR-PROJECT.supabase.co", // ← 填入你的 Supabase 项目 URL
    anonKey: "YOUR-ANON-KEY"                 // ← 填入 Supabase 的 anon public key
  },
  homePage: "Home",   // 首页路径
  title: "Joker Wiki",
  subtitle: "运行在 GitHub Pages 上的纯前端 Wiki",
  logo: "🃏"
};
