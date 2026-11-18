create table if not exists public.asa_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    role text not null default 'student' check (role in ('admin', 'student')),
    created_at timestamptz not null default now()
);

create table if not exists public.asa_admin_invites (
    email text primary key,
    created_at timestamptz not null default now()
);

create table if not exists public.asa_students (
    nim text primary key,
    name text not null,
    email text not null,
    ipk numeric(3, 2) not null check (ipk >= 0 and ipk <= 4),
    attendance numeric(5, 2) not null check (attendance >= 0 and attendance <= 100),
    academic_status text not null default 'Belum diisi',
    user_id uuid unique references auth.users(id) on delete set null,
    updated_at timestamptz not null default now()
);

create unique index if not exists asa_students_email_lower_unique
    on public.asa_students (lower(email));

create table if not exists public.asa_settings (
    id smallint primary key default 1 check (id = 1),
    institution_name text not null default 'Universitas Smart Analytics',
    academic_period text not null default 'Belum ditetapkan',
    ipk_risk_threshold numeric(3, 2) not null default 2.50 check (ipk_risk_threshold >= 0 and ipk_risk_threshold <= 4),
    ipk_warning_threshold numeric(3, 2) not null default 2.75 check (ipk_warning_threshold >= 0 and ipk_warning_threshold <= 4),
    attendance_minimum numeric(5, 2) not null default 75 check (attendance_minimum >= 0 and attendance_minimum <= 100),
    dataset_updated_at timestamptz,
    dataset_source text,
    student_count integer not null default 0 check (student_count >= 0),
    updated_at timestamptz not null default now(),
    constraint asa_settings_ipk_threshold_order check (ipk_risk_threshold < ipk_warning_threshold)
);

insert into public.asa_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.asa_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
    select exists (
        select 1
        from public.asa_profiles
        where id = (select auth.uid())
          and role = 'admin'
    );
$$;

revoke all on function public.asa_is_admin() from public, anon;
grant execute on function public.asa_is_admin() to authenticated;

create or replace function public.asa_link_student_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
    new.user_id := null;
    select users.id
      into new.user_id
      from auth.users as users
     where lower(users.email) = lower(new.email)
     limit 1;
    return new;
end;
$$;

revoke all on function public.asa_link_student_account() from public, anon, authenticated;
drop trigger if exists asa_link_student_account on public.asa_students;
create trigger asa_link_student_account
before insert or update of email on public.asa_students
for each row execute function public.asa_link_student_account();

create or replace function public.asa_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    assigned_role text;
begin
    if new.email is null then
        raise exception 'An email address is required to create an application account';
    end if;

    if exists (
        select 1 from public.asa_admin_invites
        where email = lower(new.email)
    ) then
        assigned_role := 'admin';
        delete from public.asa_admin_invites where email = lower(new.email);
    elsif exists (
        select 1 from public.asa_students
        where lower(email) = lower(new.email)
    ) then
        assigned_role := 'student';
    else
        raise exception 'Email is not eligible for an Academic Smart Analytics account';
    end if;

    insert into public.asa_profiles (id, email, role)
    values (new.id, lower(new.email), assigned_role)
    on conflict (id) do update set email = excluded.email;

    update public.asa_students
       set user_id = new.id,
           updated_at = now()
     where lower(email) = lower(new.email)
       and user_id is null;

    return new;
end;
$$;

revoke all on function public.asa_create_profile_for_auth_user() from public, anon, authenticated;
drop trigger if exists asa_create_profile_for_auth_user on auth.users;
create trigger asa_create_profile_for_auth_user
after insert on auth.users
for each row execute function public.asa_create_profile_for_auth_user();

create or replace function public.asa_import_students(
    p_students jsonb,
    p_replace_all boolean default false,
    p_source text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    imported_count integer;
    final_count integer;
begin
    if not public.asa_is_admin() then
        raise exception 'Administrator access is required' using errcode = '42501';
    end if;
    if jsonb_typeof(p_students) is distinct from 'array' then
        raise exception 'Student data must be a JSON array';
    end if;
    if jsonb_array_length(p_students) = 0 then
        raise exception 'Student data must be a non-empty JSON array';
    end if;
    if jsonb_array_length(p_students) > 5000 then
        raise exception 'A single import cannot exceed 5000 rows';
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(p_students) as row_data(
            nim text, name text, email text, ipk numeric, attendance numeric, academic_status text
        )
        group by nim
        having count(*) > 1
    ) or exists (
        select 1
        from jsonb_to_recordset(p_students) as row_data(
            nim text, name text, email text, ipk numeric, attendance numeric, academic_status text
        )
        group by lower(email)
        having count(*) > 1
    ) then
        raise exception 'Import contains duplicate NIM or email values';
    end if;

    if exists (
        select 1
        from jsonb_to_recordset(p_students) as row_data(
            nim text, name text, email text, ipk numeric, attendance numeric, academic_status text
        )
        where coalesce(trim(nim), '') = ''
           or coalesce(trim(name), '') = ''
           or email is null
           or email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
           or ipk is null or ipk < 0 or ipk > 4
           or attendance is null or attendance < 0 or attendance > 100
    ) then
        raise exception 'Import contains invalid student data';
    end if;

    if p_replace_all then
        delete from public.asa_students;
    end if;

    insert into public.asa_students (nim, name, email, ipk, attendance, academic_status)
    select trim(row_data.nim),
           trim(row_data.name),
           lower(trim(row_data.email)),
           row_data.ipk,
           row_data.attendance,
           coalesce(nullif(trim(row_data.academic_status), ''), 'Belum diisi')
    from jsonb_to_recordset(p_students) as row_data(
        nim text, name text, email text, ipk numeric, attendance numeric, academic_status text
    )
    on conflict (nim) do update
       set name = excluded.name,
           email = excluded.email,
           ipk = excluded.ipk,
           attendance = excluded.attendance,
           academic_status = excluded.academic_status,
           updated_at = now();

    get diagnostics imported_count = row_count;
    select count(*) into final_count from public.asa_students;

    update public.asa_settings
       set dataset_updated_at = now(),
           dataset_source = left(coalesce(p_source, 'CSV import'), 255),
           student_count = final_count,
           updated_at = now()
     where id = 1;

    return imported_count;
end;
$$;

revoke all on function public.asa_import_students(jsonb, boolean, text) from public, anon;
grant execute on function public.asa_import_students(jsonb, boolean, text) to authenticated;

create or replace function public.asa_clear_students()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    deleted_count integer;
begin
    if not public.asa_is_admin() then
        raise exception 'Administrator access is required' using errcode = '42501';
    end if;

    delete from public.asa_students;
    get diagnostics deleted_count = row_count;

    update public.asa_settings
       set dataset_updated_at = null,
           dataset_source = null,
           student_count = 0,
           updated_at = now()
     where id = 1;

    return deleted_count;
end;
$$;

revoke all on function public.asa_clear_students() from public, anon;
grant execute on function public.asa_clear_students() to authenticated;

alter table public.asa_profiles enable row level security;
alter table public.asa_admin_invites enable row level security;
alter table public.asa_students enable row level security;
alter table public.asa_settings enable row level security;

drop policy if exists "asa_profiles_read_own_or_admin" on public.asa_profiles;
create policy "asa_profiles_read_own_or_admin"
    on public.asa_profiles for select to authenticated
    using (id = (select auth.uid()) or (select public.asa_is_admin()));

drop policy if exists "asa_students_read_own_or_admin" on public.asa_students;
create policy "asa_students_read_own_or_admin"
    on public.asa_students for select to authenticated
    using (user_id = (select auth.uid()) or (select public.asa_is_admin()));

drop policy if exists "asa_students_admin_insert" on public.asa_students;
create policy "asa_students_admin_insert"
    on public.asa_students for insert to authenticated
    with check ((select public.asa_is_admin()));

drop policy if exists "asa_students_admin_update" on public.asa_students;
create policy "asa_students_admin_update"
    on public.asa_students for update to authenticated
    using ((select public.asa_is_admin()))
    with check ((select public.asa_is_admin()));

drop policy if exists "asa_students_admin_delete" on public.asa_students;
create policy "asa_students_admin_delete"
    on public.asa_students for delete to authenticated
    using ((select public.asa_is_admin()));

drop policy if exists "asa_settings_authenticated_read" on public.asa_settings;
create policy "asa_settings_authenticated_read"
    on public.asa_settings for select to authenticated
    using ((select auth.uid()) is not null);

drop policy if exists "asa_settings_admin_insert" on public.asa_settings;
create policy "asa_settings_admin_insert"
    on public.asa_settings for insert to authenticated
    with check ((select public.asa_is_admin()));

drop policy if exists "asa_settings_admin_update" on public.asa_settings;
create policy "asa_settings_admin_update"
    on public.asa_settings for update to authenticated
    using ((select public.asa_is_admin()))
    with check ((select public.asa_is_admin()));

grant select on public.asa_profiles to authenticated;
grant select, insert, update, delete on public.asa_students to authenticated;
grant select, insert, update on public.asa_settings to authenticated;
