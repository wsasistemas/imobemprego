-- Candidaturas também para vagas do LinkedIn, Vagas.com, site da empresa etc.
-- (a pessoa traz a vaga pelo link). Roda depois de 20261103180000.
--
-- Não apaga nem muda dados: só aceita mais tipos de link no cache de vagas
-- (antes, só links da Gupy) e atualiza a função que marca a candidatura.
-- Pode rodar de novo sem erro.

alter table imobempregos.vagas drop constraint if exists vagas_url_check;
alter table imobempregos.vagas add constraint vagas_url_check
  check (url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$)' and char_length(url) <= 500);

alter table imobempregos.vagas drop constraint if exists vagas_fonte_check;
alter table imobempregos.vagas add constraint vagas_fonte_check
  check (fonte in ('gupy', 'link'));

-- Marca a candidatura (só pagantes). Vaga que não está no cache entra com o
-- mínimo; fonte 'gupy' ou 'link' conforme o endereço.
create or replace function imobempregos.marcar_candidatura(
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
  insert into imobempregos.vagas (url, fonte, titulo, empresa)
  values (
    p_url,
    case when p_url ~ '^https://[a-z0-9-]+\.gupy\.io/' then 'gupy' else 'link' end,
    left(btrim(coalesce(nullif(btrim(p_titulo), ''), 'Vaga')), 200),
    left(nullif(btrim(p_empresa), ''), 200)
  )
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
