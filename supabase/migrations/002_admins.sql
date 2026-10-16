-- MONKAS 002: tabel admin (username + password hash SHA-256 berlapis)
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);
