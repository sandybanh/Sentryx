create table if not exists familiar_faces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  encoding jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists familiar_faces_user_id_idx on familiar_faces(user_id);

alter table familiar_faces enable row level security;

create policy "Users can manage own familiar faces"
  on familiar_faces for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
