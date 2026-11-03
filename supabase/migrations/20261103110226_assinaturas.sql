-- Assinatura do ImobEmpregos: R$ 10/mês, sem fidelidade, 10 dias grátis sem cartão.
--
-- Quem tem acesso: quem está no teste grátis (teste_ate no futuro) ou pagou o
-- período atual (acesso_ate no futuro). Só o servidor (service_role, via
-- webhook do Asaas) altera esta tabela; o usuário só lê a própria linha.
--
-- O CPF NÃO é guardado aqui: vai direto para o cadastro do cliente no Asaas,
-- que exige CPF para cobrar.

create type imobempregos.status_assinatura as enum (
  'teste',      -- dentro (ou depois) dos 10 dias grátis, sem assinatura
  'ativa',      -- assinou; o acesso vale até acesso_ate (renovado a cada pagamento)
  'atrasada',   -- a mensalidade venceu sem pagamento
  'cancelada'   -- cancelou; o acesso vale até o fim do período pago
);

create table imobempregos.assinaturas (
  usuario_id          uuid primary key references auth.users (id) on delete cascade,
  status              imobempregos.status_assinatura not null default 'teste',
  teste_ate           timestamptz not null default (now() + interval '10 days'),
  acesso_ate          timestamptz,           -- fim do período pago (null = nunca pagou)
  forma               text check (forma in ('PIX', 'CREDIT_CARD')),
  asaas_cliente_id    text unique,
  asaas_assinatura_id text unique,
  asaas_checkout_id   text,
  fatura_url          text check (fatura_url ~ '^https://([a-z0-9-]+\.)?asaas\.com/'),  -- última cobrança Pix em aberto
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
comment on table imobempregos.assinaturas is 'Uma linha por usuário. Escrita só pelo servidor (webhook do Asaas). Sem CPF.';

create trigger assinaturas_atualizado_em before update on imobempregos.assinaturas
  for each row execute function imobempregos.tocar_atualizado_em();

-- Eventos do Asaas já processados: o Asaas pode reenviar o mesmo evento.
create table imobempregos.eventos_asaas (
  id          text primary key,
  evento      text not null,
  recebido_em timestamptz not null default now()
);
comment on table imobempregos.eventos_asaas is 'Idempotência do webhook do Asaas. Só service_role.';

-- O cadastro passa a criar também a assinatura (começa o teste grátis).
-- Continua agindo só em cadastros do ImobEmpregos (projeto compartilhado).
create or replace function imobempregos.criar_perfil_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'imobempregos' then
    return new;
  end if;
  insert into imobempregos.perfis (id, nome, whatsapp)
  values (
    new.id,
    btrim(new.raw_user_meta_data ->> 'nome'),
    regexp_replace(coalesce(new.raw_user_meta_data ->> 'whatsapp', ''), '[^0-9]', '', 'g')
  )
  on conflict (id) do nothing;
  insert into imobempregos.assinaturas (usuario_id) values (new.id)
  on conflict (usuario_id) do nothing;
  return new;
end;
$$;
revoke execute on function imobempregos.criar_perfil_no_cadastro() from public, anon, authenticated;

-- Quem já tem login em outro app do projeto (mesmo auth.users) ativa o
-- ImobEmpregos informando nome e WhatsApp. Cria o perfil e a assinatura (um
-- teste grátis por conta: chamar de novo não renova o teste).
-- SECURITY DEFINER porque o usuário não tem INSERT nessas tabelas; só grava
-- linhas do próprio auth.uid().
create function imobempregos.ativar_conta(p_nome text, p_whatsapp text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fone text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
begin
  if uid is null then
    raise exception 'login necessário' using errcode = '42501';
  end if;
  -- Mesma regra do app: DDD + número sem o 55 ganha o 55 na frente.
  if char_length(fone) in (10, 11) then
    fone := '55' || fone;
  end if;
  insert into imobempregos.perfis (id, nome, whatsapp)
  values (uid, btrim(p_nome), fone)
  on conflict (id) do nothing;
  insert into imobempregos.assinaturas (usuario_id) values (uid)
  on conflict (usuario_id) do nothing;
end;
$$;
revoke execute on function imobempregos.ativar_conta(text, text) from public, anon;
grant execute on function imobempregos.ativar_conta(text, text) to authenticated;

-- Contas criadas antes desta migração também ganham o teste.
insert into imobempregos.assinaturas (usuario_id)
select id from imobempregos.perfis
on conflict (usuario_id) do nothing;

-- O usuário logado tem acesso agora? Usada pelas funções do site (busca de vagas).
create function imobempregos.tem_acesso()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from imobempregos.assinaturas a
    where a.usuario_id = (select auth.uid())
      and (a.teste_ate > now() or coalesce(a.acesso_ate > now(), false))
  );
$$;
revoke execute on function imobempregos.tem_acesso() from public, anon;
grant execute on function imobempregos.tem_acesso() to authenticated;

-- ------------------------------------------------------------------ permissões e RLS

grant select on imobempregos.assinaturas to authenticated;
grant all on imobempregos.assinaturas, imobempregos.eventos_asaas to service_role;

alter table imobempregos.assinaturas   enable row level security;
alter table imobempregos.eventos_asaas enable row level security;  -- sem políticas: só service_role

create policy "assinatura: ver a própria" on imobempregos.assinaturas
  for select to authenticated using ((select auth.uid()) = usuario_id);
