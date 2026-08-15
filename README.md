# 🃏 Joker Wiki

一个**纯前端**的 Markdown Wiki，运行在 **GitHub Pages** 上。零构建、零服务器、零数据库——所有页面都是仓库 `joker-wiki/wiki/` 目录下的 `.md` 文件，页面通过 GitHub API 直接读写。

## 本仓库部署情况

- 仓库：`Angel-GP/Angel-GP.github.io`（用户站点，主分支根目录自动发布）
- Wiki 访问地址：**https://angel-gp.github.io/joker-wiki/**
- 应用代码：`joker-wiki/` 子目录；内容文件：`joker-wiki/wiki/*.md`
- 与仓库中已有的其他网站页面互不干扰

## 功能

- ✅ Markdown 渲染（markdown-it）：标题、表格、代码块、任务列表、引用、目录
- ✅ `[[双链]]`：支持 `[[页面名]]` 与 `[[页面名|别名]]`，不存在的页面显示红链、点击即创建
- ✅ 在线编辑 / 新建 / 删除（每次保存 = 一次 Git 提交）
- ✅ 版本历史：查看、恢复任意历史版本
- ✅ 反向链接：扫描哪些页面引用了当前页
- ✅ 标题搜索 + 全文搜索（客户端）
- ✅ 页面树、面包屑、深浅主题、移动端适配
- ✅ 无需 Token 即可浏览（编辑才需要）

## 目录结构

```
├── joker-wiki/                # Wiki 应用（整个站点的子目录）
│   ├── index.html             # 页面骨架
│   ├── css/style.css          # 样式（浅色/深色主题）
│   ├── js/
│   │   ├── config.js          # ⭐ owner / repo / 内容目录配置
│   │   ├── api.js             # GitHub API 封装（读取走 raw CDN）
│   │   ├── markdown.js        # markdown-it + 双链插件
│   │   └── app.js             # 路由 / 编辑 / 搜索 / 历史 / 反向链接
│   ├── lib/markdown-it.min.js
│   ├── wiki/                  # ⭐ 内容目录（Markdown 文件）
│   └── test/smoke.js          # 冒烟测试（node test/smoke.js）
├── README.md
└── ……（仓库原有的其他网站文件）
```

## 配置编辑 Token（可选，推荐）

不配置 Token 只能浏览；配置后可在网页上直接编辑、新建、删除页面。

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
2. Repository access：**Only select repositories** → 选 `Angel-GP/Angel-GP.github.io`
3. Permissions → **Contents** → **Read and write**
4. 设置过期时间 → 生成 → 复制 `github_pat_...`
5. 打开 https://angel-gp.github.io/joker-wiki/ → 左下角 ⚙ 设置 → 粘贴 Token → 保存

> ⚠️ Token 只保存在你当前浏览器的 localStorage，不会上传到服务器。请勿在公共电脑配置，并设置过期时间。

## 本地更新与推送

```bash
# 本机 git 位于 E:\Win\Desktop\agent\work\tools\PortableGit
git -C <本目录> add -A
git -C <本目录> commit -m "更新 Wiki"
git -C <本目录> push
```

推送后约 1 分钟，https://angel-gp.github.io/joker-wiki/ 自动更新。

## 注意事项

| 事项 | 说明 |
| ---- | ---- |
| API 限额 | 无 Token 时 `api.github.com` 限额 60 次/小时（页面列表/历史）。**浏览页面走 raw CDN，不受限**；页面列表已做本地缓存 |
| CDN 缓存 | 刚保存的页面 raw CDN 最多缓存 5 分钟，立即硬刷新可能看到旧版 |
| 公开可见 | 公开仓库的 Wiki 内容所有人可见 |
| 多人协作 | 纯前端无法多人实时协作，适合个人知识库 |
