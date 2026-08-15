-- =========================================================
-- Joker Wiki — Supabase 初始化脚本
-- 用法：Supabase 控制台 → SQL Editor → 粘贴本文件全部内容 → Run
-- =========================================================

-- 1) 页面表（当前内容）
create table if not exists public.pages (
  path text primary key,
  content text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- 2) 历史版本表（每次保存一条）
create table if not exists public.revisions (
  id bigint generated always as identity primary key,
  path text not null,
  content text not null,
  message text not null default '',
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists revisions_path_idx on public.revisions (path, created_at desc);

-- 3) 行级安全：任何人可读，直接写表一律禁止
alter table public.pages enable row level security;
alter table public.revisions enable row level security;

drop policy if exists "pages_read" on public.pages;
create policy "pages_read" on public.pages for select using (true);

drop policy if exists "revisions_read" on public.revisions;
create policy "revisions_read" on public.revisions for select using (true);

revoke insert, update, delete on public.pages from anon, authenticated;
revoke insert, update, delete on public.revisions from anon, authenticated;

-- 4) 保存函数（登录用户专用，原子地更新页面 + 写历史）
create or replace function public.save_page(p_path text, p_content text, p_message text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into pages(path, content, updated_by)
  values (p_path, p_content, auth.uid())
  on conflict (path) do update
    set content = excluded.content,
        updated_at = now(),
        updated_by = excluded.updated_by;

  insert into revisions(path, content, message, author_name)
  values (p_path, p_content, p_message, coalesce(v_email, 'unknown'));
end;
$$;

grant execute on function public.save_page(text, text, text) to authenticated;

-- 5) 删除函数（登录用户专用）
create or replace function public.delete_page(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from revisions where path = p_path;
  delete from pages where path = p_path;
end;
$$;

grant execute on function public.delete_page(text) to authenticated;

-- 6) 种子数据（首页 + 使用指南）
insert into pages(path, content) values
('Home', $md$
# 🃏 Joker Wiki

欢迎来到 Joker Wiki！它**完全运行在 GitHub Pages 上**，纯前端实现：没有自己的服务器，内容与账号系统由 Supabase 托管（免费）。

## 快速开始

- 左下角 **👤 登录** → 用邮箱注册一个账号（无需审批）
- 登录后点右上角 **✏️ 编辑** 即可修改任何页面，每次保存自动记录你的邮箱和时间
- 点左侧 **＋ 新建页面** 创建新页面
- 输入 `[[页面名]]` 即可创建内部链接（双链）

## 功能一览

| 功能 | 说明 |
| ---- | ---- |
| Markdown 渲染 | 标题、表格、代码块、任务列表、引用等 |
| `[[双链]]` | 页面互相引用，支持 `[[目标\|别名]]` |
| 全文搜索 | 侧边栏勾选「全文搜索」后回车 |
| 版本历史 | 查看 / 恢复任意历史版本 |
| 反向链接 | 查看哪些页面链接到了当前页 |
| 账号系统 | 邮箱注册登录，编辑记录可追溯 |
| 深浅主题 | 侧边栏右下角 🌙 切换 |

## Markdown 语法示例

### 列表与任务

- [x] 已完成的任务
- [ ] 未完成的任务
- 普通列表项

### 代码

行内代码 `const x = 1;`，以及代码块：

```js
console.log("Hello, Joker Wiki!");
```

### 引用

> 知识就是力量。—— 弗朗西斯·培根

### 表格

| 语法 | 效果 |
| ---- | ---- |
| `[[页面]]` | 内部链接 |
| `[文字](https://example.com)` | 外部链接 |

---

开始写点东西吧 ✍️
$md$),
('使用指南', $md$
# 使用指南

本 Wiki 是**纯前端应用**，托管在 GitHub Pages；页面内容与账号系统由 **Supabase** 托管（免费）。没有自己的服务器代码。

## 一、注册与登录

1. 左下角点击 **👤 登录**
2. 切换到「注册」，用邮箱 + 密码（至少 6 位）注册
3. 注册成功即自动登录；之后编辑、新建、删除都可用
4. 每次保存都会记录你的邮箱与时间（页面右上角 🕘 历史可查）

> 如果注册后提示需要验证邮件，请到邮箱点击验证链接（可能在垃圾箱）。

## 二、编辑与双链

- 登录后右上角 **✏️ 编辑** 进入编辑器，`Ctrl+S` 或点「保存」
- 用 `[[页面名]]` 引用其他页面，例如 [[Home]]；不存在的页面显示为**红色虚线**，点击即可创建
- 支持 `[[页面名|自定义文字]]` 别名语法
- 新建页面时路径可用 `/` 建层级，如 `前端/React`

## 三、其他功能

- **搜索**：侧边栏输入关键字实时过滤标题；勾选「全文搜索」后回车搜索正文
- **历史**：右上角 🕘 查看最近 50 次保存，可查看旧版本或恢复到编辑器
- **反向链接**：右上角 🔗 查看哪些页面引用了当前页
- **目录**：正文标题自动生成右侧目录（桌面端）

## 四、维护者说明

- 数据表：`pages`（当前内容）、`revisions`（历史版本）
- 数据库安全：行级策略只允许读取；写入必须登录，统一走 `save_page` / `delete_page` 函数
- 配置：站点代码仓库 `joker-wiki/js/config.js` 中填入 Supabase 项目 URL 与 anon key
- 备份：Supabase 控制台 Database → Backups 可设置自动备份

## 五、已知限制

| 限制 | 说明 |
| ---- | ---- |
| 最后保存生效 | 多人同时编辑同一页时，后保存的覆盖先保存的（历史版本可恢复） |
| 邮件验证 | 免费版验证邮件偶尔进垃圾箱 |
| 免费额度 | 数据库 500MB / 每月 5 万活跃用户，个人 Wiki 绰绰有余 |

返回 [[Home]]。
$md$)
on conflict (path) do nothing;
