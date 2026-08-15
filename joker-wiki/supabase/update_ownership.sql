-- =========================================================
-- Joker Wiki — 所有权迁移（v2）
-- 作用：每个页面只能由「创建者」编辑/删除；未认领的页面（首页/指南）
--       由第一个编辑它的人自动认领。
-- 用法：Supabase 控制台 → SQL Editor → 粘贴全部内容 → Run
-- =========================================================

alter table public.pages add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.pages add column if not exists owner_name text;

-- 保存：仅创建者（或认领未认领页面的人）可写
create or replace function public.save_page(p_path text, p_content text, p_message text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  -- 所有权检查：页面已有创建者且不是当前用户 → 拒绝
  select owner_id into v_owner from pages where path = p_path;
  if v_owner is not null and v_owner <> auth.uid() then
    raise exception 'permission denied: 只能编辑自己创建的页面';
  end if;

  insert into pages(path, content, updated_by, owner_id, owner_name)
  values (p_path, p_content, auth.uid(), auth.uid(), coalesce(v_email, 'unknown'))
  on conflict (path) do update
    set content = excluded.content,
        updated_at = now(),
        updated_by = excluded.updated_by;

  insert into revisions(path, content, message, author_name)
  values (p_path, p_content, p_message, coalesce(v_email, 'unknown'));
end;
$$;

grant execute on function public.save_page(text, text, text) to authenticated;

-- 删除：仅创建者可删
create or replace function public.delete_page(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select owner_id into v_owner from pages where path = p_path;
  if v_owner is null then
    raise exception '页面不存在';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'permission denied: 只能删除自己创建的页面';
  end if;

  delete from revisions where path = p_path;
  delete from pages where path = p_path;
end;
$$;

grant execute on function public.delete_page(text) to authenticated;
