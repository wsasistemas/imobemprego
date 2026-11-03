-- Schema do aplicativo imobempregos.
--
-- Acesso: login com e-mail e senha (Supabase Auth). O cadastro pede nome,
-- WhatsApp, e-mail e senha; nome e WhatsApp ficam em imobempregos.perfis.
--
-- Princípio de privacidade: o currículo NUNCA é gravado no banco. A análise e a
-- nota de aderência são calculadas no navegador; aqui ficam só as escolhas do
-- usuário (buscas salvas, vagas acompanhadas) e um cache das vagas públicas.
--
-- Depois de aplicar no projeto hospedado, inclua "imobempregos" em
-- Project Settings > Data API > Exposed schemas (o config.toml local já inclui).

create schema if not exists imobempregos;

grant usage on schema imobempregos to anon, authenticated, service_role;

-- ------------------------------------------------------------------ tipos

create type imobempregos.status_candidatura as enum (
  'salva',        -- guardou para ver depois
  'candidatei',
  'entrevista',
  'oferta',
  'recusada',     -- a empresa recusou
  'descartada'    -- o usuário desistiu
);

-- ------------------------------------------------------------------ funções auxiliares

create function imobempregos.tocar_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ perfis

create table imobempregos.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null check (char_length(btrim(nome)) between 2 and 120),
  -- Celular brasileiro no formato internacional, só dígitos: 55 + DDD + 9 + 8 dígitos.
  whatsapp      text not null check (whatsapp ~ '^55[1-9]{2}9[0-9]{8}$'),
  cidade        text check (char_length(cidade) <= 120),
  uf            char(2) check (uf ~ '^[A-Z]{2}$'),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table imobempregos.perfis is 'Um perfil por usuário, criado no cadastro (nome e WhatsApp). Sem currículo.';

create trigger perfis_atualizado_em before update on imobempregos.perfis
  for each row execute function imobempregos.tocar_atualizado_em();

-- Cria o perfil quando a pessoa se cadastra, com o nome e o WhatsApp enviados
-- no signUp (options.data). Precisa de SECURITY DEFINER porque roda como o papel
-- do Auth, que não tem acesso a este schema. Se nome ou WhatsApp faltarem ou
-- forem inválidos, as restrições da tabela recusam e o cadastro inteiro falha:
-- não existe conta sem perfil completo.
-- (Os metadados do usuário são editáveis por ele: servem só para preencher o
-- perfil, nunca para decidir permissões.)
create function imobempregos.criar_perfil_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into imobempregos.perfis (id, nome, whatsapp)
  values (
    new.id,
    btrim(new.raw_user_meta_data ->> 'nome'),
    regexp_replace(coalesce(new.raw_user_meta_data ->> 'whatsapp', ''), '[^0-9]', '', 'g')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function imobempregos.criar_perfil_no_cadastro() from public, anon, authenticated;

create trigger imobempregos_criar_perfil after insert on auth.users
  for each row execute function imobempregos.criar_perfil_no_cadastro();

-- ------------------------------------------------------------------ vagas (cache público)

create table imobempregos.vagas (
  url           text primary key
                check (url ~ '^https://[a-z0-9-]+\.gupy\.io/jobs/[0-9]+$'),
  fonte         text not null default 'gupy' check (fonte in ('gupy')),
  titulo        text not null,
  empresa       text,
  cidade        text,
  estado        text,
  modalidade    text check (modalidade in ('Remoto', 'Híbrido', 'Presencial')),
  tipo          text,
  publicada     timestamptz,
  prazo         date,
  ativa         boolean not null default true,
  texto         text,          -- vaga completa, com os títulos de seção da Gupy
  atualizado_em timestamptz not null default now()
);
comment on table imobempregos.vagas is 'Cache de vagas públicas. Só o servidor (service_role) grava.';

create index vagas_publicada_idx on imobempregos.vagas (publicada desc);

create trigger vagas_atualizado_em before update on imobempregos.vagas
  for each row execute function imobempregos.tocar_atualizado_em();

-- ------------------------------------------------------------------ buscas salvas (alertas)

create table imobempregos.buscas_salvas (
  id              bigint generated always as identity primary key,
  usuario_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  termo           text not null check (char_length(btrim(termo)) between 2 and 80),
  estado          text check (char_length(estado) <= 40),
  remoto          boolean not null default false,
  nota_minima     smallint not null default 30 check (nota_minima between 0 and 100),
  ativa           boolean not null default true,
  alerta_email    boolean not null default false,
  ultima_execucao timestamptz,
  criado_em       timestamptz not null default now()
);
comment on table imobempregos.buscas_salvas is 'Buscas que o usuário quer repetir (Vigia de Vagas na nuvem).';

create index buscas_salvas_usuario_idx on imobempregos.buscas_salvas (usuario_id);
create index buscas_salvas_ativas_idx on imobempregos.buscas_salvas (ultima_execucao nulls first) where ativa;

-- ------------------------------------------------------------------ vagas do usuário (acompanhamento)

create table imobempregos.vagas_usuario (
  usuario_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vaga_url      text not null references imobempregos.vagas (url) on delete cascade,
  status        imobempregos.status_candidatura not null default 'salva',
  nota          smallint check (nota between 0 and 100),  -- calculada no navegador
  faltam        text[] not null default '{}',             -- requisitos que não aparecem no currículo
  anotacoes     text check (char_length(anotacoes) <= 5000),
  candidatou_em date,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, vaga_url)
);
comment on table imobempregos.vagas_usuario is 'Vagas que o usuário salvou ou acompanha, com status da candidatura.';

create index vagas_usuario_vaga_idx on imobempregos.vagas_usuario (vaga_url);

create trigger vagas_usuario_atualizado_em before update on imobempregos.vagas_usuario
  for each row execute function imobempregos.tocar_atualizado_em();

-- ------------------------------------------------------------------ permissões (Data API)

grant select on imobempregos.vagas to anon, authenticated;
grant select, update on imobempregos.perfis to authenticated;
grant select, insert, update, delete on imobempregos.buscas_salvas to authenticated;
grant select, insert, update, delete on imobempregos.vagas_usuario to authenticated;
grant all on all tables in schema imobempregos to service_role;
grant usage, select on all sequences in schema imobempregos to service_role;

-- ------------------------------------------------------------------ RLS

alter table imobempregos.perfis        enable row level security;
alter table imobempregos.vagas         enable row level security;
alter table imobempregos.buscas_salvas enable row level security;
alter table imobempregos.vagas_usuario enable row level security;

-- vagas: leitura pública (são vagas publicadas na internet); escrita só service_role.
create policy "vagas: leitura pública" on imobempregos.vagas
  for select to anon, authenticated using (true);

-- perfis: cada um vê e edita só o seu.
create policy "perfis: ver o próprio" on imobempregos.perfis
  for select to authenticated using ((select auth.uid()) = id);
create policy "perfis: editar o próprio" on imobempregos.perfis
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- buscas_salvas: só as próprias.
create policy "buscas: ver as próprias" on imobempregos.buscas_salvas
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "buscas: criar as próprias" on imobempregos.buscas_salvas
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "buscas: editar as próprias" on imobempregos.buscas_salvas
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "buscas: apagar as próprias" on imobempregos.buscas_salvas
  for delete to authenticated using ((select auth.uid()) = usuario_id);

-- vagas_usuario: só as próprias.
create policy "minhas vagas: ver" on imobempregos.vagas_usuario
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "minhas vagas: criar" on imobempregos.vagas_usuario
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "minhas vagas: editar" on imobempregos.vagas_usuario
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "minhas vagas: apagar" on imobempregos.vagas_usuario
  for delete to authenticated using ((select auth.uid()) = usuario_id);
