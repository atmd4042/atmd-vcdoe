create extension if not exists pgcrypto;

create sequence if not exists public.order_number_seq start 2050;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'customer' check (role in ('customer', 'provider', 'admin')),
  provider_status text not null default 'not_applicable'
    check (provider_status in ('not_applicable', 'pending', 'approved', 'rejected', 'suspended')),
  office_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text not null default 'خ',
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories(id),
  slug text not null unique,
  name text not null,
  description text not null default '',
  price_sar numeric(10, 2) check (price_sar is null or price_sar >= 0),
  duration text,
  requirements text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.profiles(id),
  provider_id uuid references public.profiles(id),
  service_id uuid not null references public.services(id),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'in_progress', 'completed', 'cancelled', 'rejected')),
  details text not null default '',
  quoted_price_sar numeric(10, 2) check (quoted_price_sar is null or quoted_price_sar >= 0),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null default '',
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  constraint message_has_content check (length(trim(body)) > 0 or attachment_path is not null)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function public.can_access_order(target_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.orders o
    where o.id = target_order
      and (o.customer_id = (select auth.uid()) or o.provider_id = (select auth.uid()))
  );
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  if requested_role is null or requested_role not in ('customer', 'provider') then
    requested_role := 'customer';
  end if;

  insert into public.profiles (id, full_name, phone, role, provider_status, office_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    requested_role,
    case when requested_role = 'provider' then 'pending' else 'not_applicable' end,
    nullif(new.raw_user_meta_data ->> 'office_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.set_order_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'AD-' || nextval('public.order_number_seq')::text;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_number on public.orders;
create trigger orders_set_number before insert on public.orders
for each row execute function public.set_order_number();

create or replace function public.claim_order(target_order uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.orders;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'provider'
      and p.provider_status = 'approved'
  ) then
    raise exception 'اعتماد مقدم الخدمة مطلوب قبل استلام الطلب';
  end if;

  update public.orders
  set provider_id = (select auth.uid()), status = 'reviewing'
  where id = target_order and provider_id is null and status = 'pending'
  returning * into claimed;

  if claimed.id is null then
    raise exception 'تم استلام الطلب من مقدم خدمة آخر أو لم يعد متاحاً';
  end if;
  return claimed;
end;
$$;

create or replace function public.provider_update_order_status(target_order uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'provider'
      and p.provider_status = 'approved'
  ) then
    raise exception 'اعتماد مقدم الخدمة مطلوب';
  end if;
  if new_status not in ('in_progress', 'completed') then
    raise exception 'حالة الطلب غير صالحة';
  end if;
  update public.orders
  set status = new_status
  where id = target_order
    and provider_id = (select auth.uid())
    and status in ('reviewing', 'in_progress');
  if not found then
    raise exception 'الطلب غير مسند إليك أو لا يسمح بتغيير حالته';
  end if;
end;
$$;

revoke execute on function public.provider_update_order_status(uuid, text) from public, anon;
grant execute on function public.provider_update_order_status(uuid, text) to authenticated;

create or replace function public.notify_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  message_title text;
begin
  if new.status is distinct from old.status or new.provider_id is distinct from old.provider_id then
    recipient := case when new.status = 'pending' and new.provider_id is null then new.customer_id else new.customer_id end;
    message_title := case new.status
      when 'reviewing' then 'بدأت مراجعة طلبك'
      when 'in_progress' then 'بدأ تنفيذ طلبك'
      when 'completed' then 'اكتملت خدمتك'
      when 'cancelled' then 'تم إلغاء الطلب'
      when 'rejected' then 'تعذر قبول الطلب'
      else 'تم تحديث طلبك'
    end;
    insert into public.notifications (recipient_id, order_id, title, body)
    values (recipient, new.id, message_title, 'تم تحديث حالة الطلب ' || new.order_number || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_notify_change on public.orders;
create trigger orders_notify_change after update on public.orders
for each row execute function public.notify_order_change();

create or replace function public.notify_order_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_customer uuid;
  order_provider uuid;
  recipient uuid;
begin
  select customer_id, provider_id into order_customer, order_provider
  from public.orders where id = new.order_id;
  recipient := case
    when new.sender_id = order_customer then order_provider
    else order_customer
  end;
  if recipient is not null then
    insert into public.notifications (recipient_id, order_id, title, body)
    values (
      recipient,
      new.order_id,
      'رسالة جديدة في طلبك',
      case when length(trim(new.body)) > 0 then left(new.body, 180) else 'أرسل المشارك مرفقاً جديداً.' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists order_messages_notify on public.order_messages;
create trigger order_messages_notify after insert on public.order_messages
for each row execute function public.notify_order_message();

alter table public.profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.order_messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Profiles visible to self and admins" on public.profiles;
create policy "Profiles visible to self and admins" on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "Users update own customer profile" on public.profiles;
create policy "Users update own customer profile" on public.profiles
for update to authenticated
using (id = (select auth.uid()) and role <> 'admin')
with check (
  id = (select auth.uid())
  and role in ('customer', 'provider')
);
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create or replace function public.admin_set_provider_status(provider_uuid uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'صلاحية الإدارة مطلوبة';
  end if;
  if new_status not in ('approved', 'rejected', 'suspended', 'pending') then
    raise exception 'حالة مقدم الخدمة غير صالحة';
  end if;
  update public.profiles
  set provider_status = new_status
  where id = provider_uuid and role = 'provider';
  if not found then
    raise exception 'مقدم الخدمة غير موجود';
  end if;
end;
$$;
revoke execute on function public.admin_set_provider_status(uuid, text) from public, anon;
grant execute on function public.admin_set_provider_status(uuid, text) to authenticated;

drop policy if exists "Active service categories are public" on public.service_categories;
create policy "Active service categories are public" on public.service_categories
for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "Admins manage service categories" on public.service_categories;
create policy "Admins manage service categories" on public.service_categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Active services are public" on public.services;
create policy "Active services are public" on public.services
for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "Admins manage services" on public.services;
create policy "Admins manage services" on public.services
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Order participants and eligible providers can view orders" on public.orders;
create policy "Order participants and eligible providers can view orders" on public.orders
for select to authenticated using (
  public.can_access_order(id)
  or (
    provider_id is null and status = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'provider'
        and p.provider_status = 'approved'
    )
  )
);
drop policy if exists "Customers create own orders" on public.orders;
create policy "Customers create own orders" on public.orders
for insert to authenticated with check (
  customer_id = (select auth.uid()) and provider_id is null and status = 'pending'
);
drop policy if exists "Customers cancel their pending orders" on public.orders;
create policy "Customers cancel their pending orders" on public.orders
for update to authenticated
using (customer_id = (select auth.uid()) and status = 'pending')
with check (customer_id = (select auth.uid()) and provider_id is null and status = 'cancelled');
drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders" on public.orders
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant execute on function public.claim_order(uuid) to authenticated;
revoke execute on function public.claim_order(uuid) from public, anon;

drop policy if exists "Order files visible to participants" on public.order_files;
create policy "Order files visible to participants" on public.order_files
for select to authenticated using (public.can_access_order(order_id));
drop policy if exists "Participants upload order files" on public.order_files;
create policy "Participants upload order files" on public.order_files
for insert to authenticated with check (
  uploaded_by = (select auth.uid()) and public.can_access_order(order_id)
);
drop policy if exists "Admins manage order files" on public.order_files;
create policy "Admins manage order files" on public.order_files
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Order participants read messages" on public.order_messages;
create policy "Order participants read messages" on public.order_messages
for select to authenticated using (public.can_access_order(order_id));
drop policy if exists "Participants send messages" on public.order_messages;
create policy "Participants send messages" on public.order_messages
for insert to authenticated with check (
  sender_id = (select auth.uid()) and public.can_access_order(order_id)
);
drop policy if exists "Admins manage messages" on public.order_messages;
create policy "Admins manage messages" on public.order_messages
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
for select to authenticated using (recipient_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications
for update to authenticated using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));
drop policy if exists "Admins manage notifications" on public.notifications;
create policy "Admins manage notifications" on public.notifications
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.service_categories (slug, name, icon, sort_order)
values
  ('najiz', 'خدمات ناجز', 'ن', 1),
  ('ejar', 'خدمات إيجار', 'إ', 2),
  ('workers', 'خدمات الموظفين والعمال', 'ع', 3),
  ('support', 'خدمات الدعم والقروض', 'د', 4),
  ('education', 'الخدمات التعليمية', 'ت', 5),
  ('design', 'خدمات التصميم', 'ص', 6),
  ('municipal', 'الخدمات البلدية', 'ب', 7),
  ('other', 'خدمات أخرى', 'خ', 8)
on conflict (slug) do update set name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order;

insert into public.services (category_id, slug, name, description, requirements, sort_order)
select c.id, s.slug, s.name, s.description, s.requirements, s.sort_order
from (values
  ('najiz','najiz-power-of-attorney','تسجيل وكالة','مساعدة في إجراءات تسجيل الوكالة ومتابعة الطلب.','{}'::text[],1),
  ('najiz','najiz-verify-power-of-attorney','التحقق من وكالة','التحقق من بيانات الوكالة وحالتها.','{}'::text[],2),
  ('najiz','najiz-update-deed','تحديث صك','متابعة طلب تحديث بيانات الصك.','{}'::text[],3),
  ('najiz','najiz-amend-deed','تعديل صك','مساعدة في تقديم طلب تعديل الصك.','{}'::text[],4),
  ('najiz','najiz-appointment','حجز موعد ناجز','المساعدة في حجز موعد ومتابعته.','{}'::text[],5),
  ('najiz','najiz-custody-letter','إصدار خطاب حضانة','متابعة إجراءات إصدار خطاب الحضانة.','{}'::text[],6),
  ('najiz','najiz-transaction-follow-up','متابعة المعاملات العدلية','متابعة حالة المعاملات العدلية.','{}'::text[],7),
  ('ejar','ejar-register','تسجيل إيجار','المساعدة في تسجيل طلبات إيجار.','{}'::text[],1),
  ('ejar','ejar-contract-issue','إصدار عقد إيجار','إعداد ومتابعة طلب إصدار عقد.','{}'::text[],2),
  ('ejar','ejar-contract-certify','توثيق عقد إيجار','متابعة إجراءات توثيق العقد.','{}'::text[],3),
  ('ejar','ejar-contract-cancel','إلغاء عقد إيجار','المساعدة في تقديم طلب إلغاء عقد.','{}'::text[],4),
  ('ejar','ejar-follow-up','متابعة حالة طلب إيجار','متابعة حالة طلب إيجار.','{}'::text[],5),
  ('workers','qiwa','خدمات منصة قوى','مساعدة في خدمات منصة قوى للأفراد والمنشآت.','{}'::text[],1),
  ('workers','workers-occupation-transfer','تحويل مهن العمالة','متابعة طلبات تغيير المهنة.','{}'::text[],2),
  ('workers','freelance-document','وثيقة العمل الحر','المساعدة في إجراءات وثيقة العمل الحر.','{}'::text[],3),
  ('workers','driving-license-renewal','تجديد رخصة القيادة','متابعة إجراءات تجديد رخصة القيادة.','{}'::text[],4),
  ('workers','extension','تمديد','مساعدة في تقديم طلب التمديد المناسب.','{}'::text[],5),
  ('workers','visit-visa-renewal','تجديد تأشيرة الزيارة','متابعة إجراءات تمديد أو تجديد تأشيرة الزيارة.','{}'::text[],6),
  ('support','citizen-account','حساب المواطن','مساعدة في خدمات حساب المواطن ومتابعة الطلب.','{}'::text[],1),
  ('support','reef','منصة ريف','مساعدة في طلبات وخدمات منصة ريف.','{}'::text[],2),
  ('support','developed-social-security','الضمان المطور','مساعدة في خدمات الضمان الاجتماعي المطور.','{}'::text[],3),
  ('support','social-development-bank','بنك التنمية الاجتماعية','مساعدة في التقديم ومتابعة الخدمات.','{}'::text[],4),
  ('support','tamheer','تمهير','مساعدة في خدمات برنامج تمهير.','{}'::text[],5),
  ('support','hafez','حافز','مساعدة في خدمات حافز ومتابعة الطلب.','{}'::text[],6),
  ('education','graduation-project','مشاريع التخرج','دعم تخطيطي وتنسيقي للمشاريع التعليمية وفق ضوابط النزاهة الأكاديمية.','{}'::text[],1),
  ('education','articles','كتابة المقالات','مساعدة تحريرية وتنسيقية للمقالات.','{}'::text[],2),
  ('education','reports','كتابة التقارير','تنسيق ومراجعة التقارير.','{}'::text[],3),
  ('education','noor','خدمات نظام نور','مساعدة في الخدمات المتاحة عبر نظام نور.','{}'::text[],4),
  ('education','research','الأبحاث','مساعدة في التنسيق والتدقيق الأكاديمي دون انتحال.','{}'::text[],5),
  ('education','presentations','العروض التقديمية','إعداد وتصميم عروض تقديمية.','{}'::text[],6),
  ('education','preparatory-records','السجلات التحضيرية','تنسيق السجلات والنماذج التحضيرية.','{}'::text[],7),
  ('design','logo-design','تصميم شعار','تصميم شعار حسب وصف الطلب.','{}'::text[],1),
  ('design','visual-identity','تصميم هوية بصرية','تصميم عناصر هوية بصرية حسب نطاق العمل.','{}'::text[],2),
  ('design','social-posts','تصميم بوستات','تصميم منشورات لمنصات التواصل.','{}'::text[],3),
  ('design','business-cards','تصميم بطاقات عمل','تصميم بطاقات عمل للطباعة والنسخة الرقمية.','{}'::text[],4),
  ('design','wedding-invitations','دعوات زواج','تصميم دعوة زواج رقمية أو للطباعة.','{}'::text[],5),
  ('design','newborn-announcement','بشارة مولود','تصميم بطاقة بشارة مولود.','{}'::text[],6),
  ('design','menu-design','تصميم منيو','تصميم قائمة طعام للمطاعم والمقاهي.','{}'::text[],7),
  ('design','ai-text-to-speech','تحويل النص لصوت بالذكاء الاصطناعي','إنتاج ملف صوتي من النص المقدم.','{}'::text[],8),
  ('design','ai-image','تصميم الصور بالذكاء الاصطناعي','إنشاء صور وفق وصف الطلب.','{}'::text[],9),
  ('design','ai-video','تصميم الفيديو بالذكاء الاصطناعي','إنشاء مقطع فيديو وفق وصف الطلب.','{}'::text[],10),
  ('municipal','health-certificate','إصدار شهادة صحية','مساعدة في إجراءات الشهادة الصحية.','{}'::text[],1),
  ('municipal','municipal-license','رخصة بلدية','مساعدة في إجراءات الرخص البلدية.','{}'::text[],2),
  ('municipal','civil-defense-license','ترخيص الدفاع المدني','متابعة إجراءات الترخيص.','{}'::text[],3),
  ('municipal','violation-objection','الاعتراض على المخالفات','مساعدة في إعداد ومتابعة طلب الاعتراض.','{}'::text[],4),
  ('municipal','your-opinion-matters-sticker','إصدار ملصق رأيك يفرق','مساعدة في طلب إصدار الملصق.','{}'::text[],5)
) as s(category_slug, slug, name, description, requirements, sort_order)
join public.service_categories c on c.slug = s.category_slug
on conflict (slug) do update
set name = excluded.name, description = excluded.description,
    requirements = excluded.requirements, sort_order = excluded.sort_order;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-files',
  'order-files',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = false, file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "Order participants read private files" on storage.objects;
create policy "Order participants read private files" on storage.objects
for select to authenticated using (
  bucket_id = 'order-files'
  and public.can_access_order(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "Users upload files to their own orders" on storage.objects;
create policy "Users upload files to their own orders" on storage.objects
for insert to authenticated with check (
  bucket_id = 'order-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.can_access_order(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "Users delete own order files" on storage.objects;
create policy "Users delete own order files" on storage.objects
for delete to authenticated using (
  bucket_id = 'order-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_messages'
  ) then
    alter publication supabase_realtime add table public.order_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
