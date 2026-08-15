# 🃏 Joker Wiki（Supabase 版）

一个**纯前端**的多人协作 Markdown Wiki，运行在 **GitHub Pages** 上；账号系统与内容存储由 **Supabase**（免费 BaaS）托管，无需自建服务器。

```
访客浏览器 ──读──> Supabase（pages 表，任何人可读）
访客 ──邮箱注册/登录──> Supabase Auth 签发身份令牌
已登录者 ──写──> save_page RPC ──> pages + revisions（数据库 RLS 强制登录）
```

## 本仓库部署情况

- 仓库：`Angel-GP/Angel-GP.github.io`（用户站点，主分支自动发布）
- Wiki 访问地址：**https://angel-gp.github.io/joker-wiki/**
- 应用代码：`joker-wiki/` 子目录；数据库脚本：`joker-wiki/supabase/setup.sql`
- 与仓库中已有的其他网站页面互不干扰

## 功能

- ✅ Markdown 渲染（markdown-it）：标题、表格、代码块、任务列表、引用、目录
- ✅ `[[双链]]`：支持 `[[页面名]]` 与 `[[页面名|别名]]`，不存在的页面显示红链、点击即创建
- ✅ **账号系统**：邮箱注册/登录（Supabase Auth），会话保存在浏览器
- ✅ **人人可编辑**：注册即可编辑/新建/删除，每次保存记录作者邮箱与时间
- ✅ 版本历史：查看、恢复任意历史版本
- ✅ 反向链接、标题搜索 + 全文搜索、页面树、深浅主题、移动端适配
- ✅ 无需登录即可浏览

## 目录结构

```
├── joker-wiki/                # Wiki 应用（整个站点的子目录）
│   ├── index.html             # 页面骨架
│   ├── css/style.css          # 样式（浅色/深色主题）
│   ├── js/
│   │   ├── config.js          # ⭐ Supabase URL / anon key 配置
│   │   ├── api.js             # Supabase 数据层 + 认证封装
│   │   ├── markdown.js        # markdown-it + 双链插件
│   │   └── app.js             # 路由 / 登录 / 编辑 / 搜索 / 历史 / 反向链接
│   ├── lib/markdown-it.min.js
│   ├── lib/supabase.min.js
│   ├── supabase/setup.sql     # ⭐ 数据库初始化脚本（建表 + RLS + 种子数据）
│   ├── wiki/                  # 种子页面的 Markdown 副本
│   └── test/smoke.js          # 冒烟测试（node test/smoke.js）
├── README.md
└── ……（仓库原有的其他网站文件）
```

## 一次性初始化（维护者，约 10 分钟）

1. **创建 Supabase 项目**：注册 https://supabase.com → New project（选免费计划，区域随意）→ 记下数据库密码。

2. **执行初始化 SQL**：项目控制台 → **SQL Editor** → New query → 粘贴 `joker-wiki/supabase/setup.sql` 的全部内容 → **Run**。这会创建 `pages` / `revisions` 表、行级安全策略、`save_page` / `delete_page` 函数，并写入首页和指南两页种子数据。

3. **获取连接信息**：控制台 → **Project Settings → API**，复制两样东西：
   - `Project URL`（形如 `https://xxxx.supabase.co`）
   - `anon` `public` key（形如 `eyJhbGciOi...`，这是公开密钥，可放心放在前端）

4. **填入配置**：编辑 `joker-wiki/js/config.js`，把上面两样填进 `supabase.url` 和 `supabase.anonKey`，提交推送（约 1 分钟生效）。

5. **（推荐）关闭邮箱验证**：控制台 → **Authentication → Providers → Email** → 关闭 **Confirm email** 开关。这样访客注册后立即登录，无需收验证邮件（免费版邮件偶尔进垃圾箱）。

6. 打开 https://angel-gp.github.io/joker-wiki/ → 左下角 👤 注册一个账号试试编辑。

## 访客使用说明

| 操作 | 说明 |
| ---- | ---- |
| 浏览 | 无需登录 |
| 编辑 / 新建 / 删除 | 左下角 👤 注册（邮箱 + 6 位以上密码），登录后可用 |
| 双链 | 写 `[[页面名]]`，红链点击即创建 |
| 历史 | 右上角 🕘，可查看旧版本、恢复到编辑器 |
| 搜索 | 侧边栏；勾选「全文搜索」后回车搜正文 |

## 本地更新与推送

```bash
# 本机 git 位于 E:\Win\Desktop\agent\work\tools\PortableGit（SSH 已配置）
git -C <本目录> add -A
git -C <本目录> commit -m "更新 Wiki"
git -C <本目录> push
```

## 注意事项

| 事项 | 说明 |
| ---- | ---- |
| 数据安全 | 数据库 RLS：任何人可读，写入必须登录且只能走 `save_page`/`delete_page` 函数 |
| 最后保存生效 | 多人同时编辑同一页，后保存者覆盖（历史版本可恢复） |
| 免费额度 | Supabase 免费版：500MB 数据库、每月 5 万活跃用户，个人/小团队足够 |
| 备份 | Supabase 控制台 Database → Backups 可开启自动备份；也可在 SQL Editor 导出数据 |
| 匿名上传 | 目前为邮箱注册制；如需"点一下就上传"的匿名模式，可在 Supabase Auth 开启 Anonymous sign-ins 后联系调整代码 |
