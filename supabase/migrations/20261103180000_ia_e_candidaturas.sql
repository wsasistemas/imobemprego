-- IA e candidaturas, só para quem paga (R$ 19,90/mês).
-- Migração aditiva: cria uma tabela e funções; não altera nem apaga nada.
--
-- Quem é pagante: assinatura com acesso_ate no futuro (pagou e o período vale).
-- O teste grátis NÃO conta.

-- ------------------------------------------------------------------ uso da IA

create table imobempregos.uso_ia (
  usuario_id    uuid not null references auth.users (id) on delete cascade,
  mes           date not null,                       -- dia 1 do mês, horário de Brasília
  usos          smallint not null default 0 check (usos >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, mes)
);
comment on table imobempregos.uso_ia is 'Gerações de currículo/carta pela IA, por mês. Escrita só pelo servidor.';

-- Mês corrente no horário de Brasília (renova no dia 1).
create function imobempregos.mes_atual()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Conta mais um uso, se ainda couber no limite. Devolve o novo total, ou -1
-- quando o limite do mês já foi atingido. Atômica: dois pedidos ao mesmo
-- tempo não passam do limite.
create function imobempregos.consumir_uso_ia(p_usuario uuid, p_limite int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if p_limite < 1 then
    return -1;
  end if;
  insert into imobempregos.uso_ia as u (usuario_id, mes, usos)
  values (p_usuario, imobempregos.mes_atual(), 1)
  on conflict (usuario_id, mes) do update
    set usos = u.usos + 1, atualizado_em = now()
    where u.usos < p_limite
  returning u.usos into n;
  return coalesce(n, -1);
end;
$$;

-- A IA falhou depois de contar o uso: devolve.
create function imobempregos.devolver_uso_ia(p_usuario uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update imobempregos.uso_ia
     set usos = greatest(usos - 1, 0), atualizado_em = now()
   where usuario_id = p_usuario and mes = imobempregos.mes_atual();
$$;

revoke execute on function imobempregos.consumir_uso_ia(uuid, int) from public, anon, authenticated;
revoke execute on function imobempregos.devolver_uso_ia(uuid) from public, anon, authenticated;
grant execute on function imobempregos.consumir_uso_ia(uuid, int) to service_role;
grant execute on function imobempregos.devolver_uso_ia(uuid) to service_role;
grant execute on function imobempregos.mes_atual() to authenticated, service_role;

grant select on imobempregos.uso_ia to authenticated;
grant all on imobempregos.uso_ia to service_role;
alter table imobempregos.uso_ia enable row level security;
create policy "uso da IA: ver o próprio" on imobempregos.uso_ia
  for select to authenticated using ((select auth.uid()) = usuario_id);

-- ------------------------------------------------------------------ pagante

create function imobempregos.e_pagante()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from imobempregos.assinaturas a
    where a.usuario_id = (select auth.uid())
      and coalesce(a.acesso_ate > now(), false)
  );
$$;
revoke execute on function imobempregos.e_pagante() from public, anon;
grant execute on function imobempregos.e_pagante() to authenticated;

-- ------------------------------------------------------------------ candidaturas

-- Marca uma vaga da Gupy como candidatura. Só para pagantes. Se a vaga ainda
-- não está no cache (vagas), cria com o mínimo (o cache é público; por isso
-- SECURITY DEFINER, e o link é validado pelo check da tabela).
create function imobempregos.marcar_candidatura(
  p_url text, p_titulo text, p_empresa text default null,
  p_nota int default null, p_faltam text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'login necessário' using errcode = '42501';
  end if;
  if not exists (
    select 1 from imobempregos.assinaturas a
    where a.usuario_id = uid and coalesce(a.acesso_ate > now(), false)
  ) then
    raise exception 'recurso para assinantes' using errcode = '42501';
  end if;
  insert into imobempregos.vagas (url, titulo, empresa)
  values (p_url, left(btrim(coalesce(nullif(btrim(p_titulo), ''), 'Vaga')), 200), left(nullif(btrim(p_empresa), ''), 200))
  on conflict (url) do nothing;
  insert into imobempregos.vagas_usuario (usuario_id, vaga_url, status, nota, faltam, candidatou_em)
  values (
    uid, p_url, 'candidatei',
    case when p_nota between 0 and 100 then p_nota end,
    coalesce(p_faltam[1:30], '{}'),
    (now() at time zone 'America/Sao_Paulo')::date
  )
  on conflict (usuario_id, vaga_url) do update
    set status = 'candidatei',
        nota = coalesce(excluded.nota, imobempregos.vagas_usuario.nota),
        candidatou_em = coalesce(imobempregos.vagas_usuario.candidatou_em, excluded.candidatou_em);
end;
$$;
revoke execute on function imobempregos.marcar_candidatura(text, text, text, int, text[]) from public, anon;
grant execute on function imobempregos.marcar_candidatura(text, text, text, int, text[]) to authenticated;
