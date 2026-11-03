// Testa a migração do schema imobempregos num Postgres embutido (PGlite), sem
// Docker. Cria uma versão mínima do Supabase (papéis anon/authenticated/
// service_role, auth.users e auth.uid()) e confere cadastro, validações e RLS.
//
//   cd supabase/tests && npm install && npm test
//
// Aplica todas as migrações de ../migrations, em ordem.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const db = new PGlite();
const sql = (q, p) => db.query(q, p);

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);
// Todas as migrações, em ordem de nome (= ordem de data).
const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
for (const f of readdirSync(pasta).filter((n) => n.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(pasta, f), 'utf8'));
}

let falhas = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'FALHA ') + m); if (!c) falhas++; };
const erro = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
// Cadastro feito pelo ImobEmpregos (leva a marca app). outroApp: cadastro de outro app do projeto.
const cadastrar = (id, meta) => sql(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [id, JSON.stringify({ app: 'imobempregos', ...meta })]);
const outroApp = (id, meta) => sql(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [id, JSON.stringify(meta)]);
const como = async (papel, uid, fn) => {
  await db.exec(`begin; set local role ${papel}; select set_config('request.jwt.claim.sub', '${uid || ''}', true);`);
  try { return await fn(); } finally { await db.exec('rollback'); }
};

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';

// ---- cadastro
await cadastrar(A, { nome: '  Ana Souza ', whatsapp: '+55 (11) 91234-5678' });
await cadastrar(B, { nome: 'Bruno', whatsapp: '5521987654321' });
const pa = (await sql(`select nome, whatsapp from imobempregos.perfis where id = $1`, [A])).rows[0];
ok(pa && pa.nome === 'Ana Souza' && pa.whatsapp === '5511912345678', 'cadastro cria perfil com nome e WhatsApp normalizados');
for (const [meta, caso] of [
  [{ nome: 'Sem Zap' }, 'sem WhatsApp'],
  [{ whatsapp: '5511912345678' }, 'sem nome'],
  [{ nome: 'Fixo', whatsapp: '551133334444' }, 'telefone fixo'],
  [{ nome: 'Curto', whatsapp: '11912345678' }, 'sem o 55'],
  [{ nome: 'DDD', whatsapp: '5501912345678' }, 'DDD inválido'],
  [{ nome: 'x', whatsapp: '5511912345678' }, 'nome de 1 letra'],
]) {
  const id = crypto.randomUUID();
  ok(!!(await erro(() => cadastrar(id, meta))), `cadastro recusado: ${caso}`);
  ok((await sql(`select count(*)::int n from auth.users where id = $1`, [id])).rows[0].n === 0, `  e a conta não é criada (${caso})`);
}

await sql(`insert into imobempregos.vagas (url, titulo, modalidade) values ('https://e.gupy.io/jobs/1', 'Analista', 'Remoto')`);

// ---- visitante sem login
await como('anon', null, async () => {
  ok((await sql(`select * from imobempregos.vagas`)).rows.length === 1, 'anon lê vagas');
  ok(!!(await erro(() => sql(`select * from imobempregos.perfis`))), 'anon não lê perfis');
  ok(!!(await erro(() => sql(`select * from imobempregos.buscas_salvas`))), 'anon não lê buscas');
  ok(!!(await erro(() => sql(`insert into imobempregos.vagas (url,titulo) values ('https://e.gupy.io/jobs/2','x')`))), 'anon não grava vagas');
});

// ---- A cria dados
await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${A}', true);
  insert into imobempregos.buscas_salvas (termo) values ('analista fiscal');
  insert into imobempregos.vagas_usuario (vaga_url, nota, faltam) values ('https://e.gupy.io/jobs/1', 55, '{SAP}');
  update imobempregos.perfis set cidade = 'São Paulo', uf = 'SP' where id = '${A}'; commit;`);

await como('authenticated', A, async () => {
  ok((await sql(`select * from imobempregos.buscas_salvas`)).rows.length === 1, 'A vê a própria busca');
  ok((await sql(`select usuario_id from imobempregos.buscas_salvas`)).rows[0].usuario_id === A, 'usuario_id vem do login');
  ok(!!(await erro(() => sql(`insert into imobempregos.buscas_salvas (usuario_id, termo) values ('${B}', 'x1')`))), 'A não cria busca em nome de B');
  ok(!!(await erro(() => sql(`update imobempregos.buscas_salvas set usuario_id = '${B}'`))), 'A não transfere busca para B');
  ok(!!(await erro(() => sql(`update imobempregos.perfis set whatsapp = '123' where id = '${A}'`))), 'A não grava WhatsApp inválido no perfil');
  ok(!!(await erro(() => sql(`insert into imobempregos.buscas_salvas (termo) values ('x')`))), 'termo curto recusado');
  ok(!!(await erro(() => sql(`insert into imobempregos.vagas_usuario (vaga_url) values ('https://e.gupy.io/jobs/999')`))), 'não salva vaga fora do cache');
});

await como('authenticated', B, async () => {
  ok((await sql(`select * from imobempregos.buscas_salvas`)).rows.length === 0, 'B não vê buscas de A');
  ok((await sql(`select * from imobempregos.vagas_usuario`)).rows.length === 0, 'B não vê vagas de A');
  const perfis = (await sql(`select id, whatsapp from imobempregos.perfis`)).rows;
  ok(perfis.length === 1 && perfis[0].id === B, 'B vê só o próprio perfil (não vê o WhatsApp de A)');
  ok((await sql(`update imobempregos.perfis set nome='hack' where id='${A}' returning id`)).rows.length === 0, 'B não edita perfil de A');
  ok((await sql(`delete from imobempregos.buscas_salvas returning id`)).rows.length === 0, 'B não apaga buscas de A');
  ok(!!(await erro(() => sql(`select imobempregos.criar_perfil_no_cadastro()`))), 'função do cadastro não é chamável');
});

ok(!!(await erro(() => sql(`insert into imobempregos.vagas (url,titulo) values ('http://evil.com/jobs/1','x')`))), 'link sem https recusado');

// ---- assinatura: 10 dias grátis, acesso só com teste ou pagamento em dia
const ass = (await sql(`select status, extract(epoch from teste_ate - criado_em)::int as dur, acesso_ate from imobempregos.assinaturas where usuario_id = $1`, [A])).rows[0];
ok(ass && ass.status === 'teste' && ass.dur === 864000 && ass.acesso_ate === null, 'cadastro começa 10 dias de teste grátis');
const temAcesso = (uid) => como('authenticated', uid, async () => (await sql(`select imobempregos.tem_acesso() as t`)).rows[0].t);
ok((await temAcesso(A)) === true, 'no teste grátis tem acesso');
await sql(`update imobempregos.assinaturas set teste_ate = now() - interval '1 day' where usuario_id = $1`, [A]);
ok((await temAcesso(A)) === false, 'teste vencido, sem pagamento: sem acesso');
await sql(`update imobempregos.assinaturas set status = 'ativa', acesso_ate = now() + interval '30 days' where usuario_id = $1`, [A]);
ok((await temAcesso(A)) === true, 'mensalidade paga: tem acesso');
await sql(`update imobempregos.assinaturas set status = 'cancelada' where usuario_id = $1`, [A]);
ok((await temAcesso(A)) === true, 'cancelou: acesso até o fim do período pago');
await sql(`update imobempregos.assinaturas set acesso_ate = now() - interval '1 minute' where usuario_id = $1`, [A]);
ok((await temAcesso(A)) === false, 'período pago acabou: sem acesso');
await como('authenticated', A, async () => {
  ok((await sql(`select * from imobempregos.assinaturas`)).rows.length === 1, 'A vê só a própria assinatura');
  ok(!!(await erro(() => sql(`update imobempregos.assinaturas set acesso_ate = now() + interval '10 years'`))), 'A não consegue se dar acesso');
  ok(!!(await erro(() => sql(`insert into imobempregos.eventos_asaas (id, evento) values ('x','y')`))), 'A não mexe nos eventos do Asaas');
});
await como('anon', null, async () => {
  ok(!!(await erro(() => sql(`select imobempregos.tem_acesso()`))), 'anon não chama tem_acesso');
});
ok(!!(await erro(() => sql(`update imobempregos.assinaturas set fatura_url = 'https://golpe.com/pix' where usuario_id = $1`, [A]))), 'link de fatura fora do Asaas recusado');
await sql(`delete from auth.users where id = $1`, [A]);
ok((await sql(`select count(*)::int n from imobempregos.buscas_salvas`)).rows[0].n === 0, 'apagar conta apaga os dados');
ok((await sql(`select count(*)::int n from imobempregos.perfis where id = $1`, [A])).rows[0].n === 0, 'apagar conta apaga o perfil');

// ---- projeto compartilhado: cadastros de outros apps não são afetados
const D = '44444444-4444-4444-4444-444444444444';
ok(!(await erro(() => outroApp(D, { full_name: 'Dono da Doceria' }))), 'cadastro de outro app (sem WhatsApp) continua funcionando');
ok((await sql(`select count(*)::int n from imobempregos.perfis where id = $1`, [D])).rows[0].n === 0, '  e não ganha perfil no ImobEmpregos');
ok((await sql(`select count(*)::int n from imobempregos.assinaturas where usuario_id = $1`, [D])).rows[0].n === 0, '  nem teste grátis');
ok(!(await erro(() => outroApp(crypto.randomUUID(), { app: 'imobdoces', whatsapp: 'x' }))), 'cadastro marcado com outro app também passa direto');

// ---- quem já tem login de outro app ativa o ImobEmpregos
await como('authenticated', D, async () => {
  ok(!!(await erro(() => sql(`select imobempregos.ativar_conta('Dono', '123')`))), 'ativar com WhatsApp inválido é recusado');
});
await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${D}', true);
  select imobempregos.ativar_conta('  Dono da Doceria ', '(31) 98888-7777'); commit;`);
const pd = (await sql(`select nome, whatsapp from imobempregos.perfis where id = $1`, [D])).rows[0];
ok(pd && pd.nome === 'Dono da Doceria' && pd.whatsapp === '5531988887777', 'ativar cria o perfil com WhatsApp normalizado');
const t1 = (await sql(`select teste_ate from imobempregos.assinaturas where usuario_id = $1`, [D])).rows[0];
ok(!!t1, 'ativar começa o teste grátis');
await sql(`update imobempregos.assinaturas set teste_ate = now() - interval '1 day' where usuario_id = $1`, [D]);
await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${D}', true);
  select imobempregos.ativar_conta('Outro Nome', '31977776666'); commit;`);
const t2 = (await sql(`select teste_ate < now() as vencido from imobempregos.assinaturas where usuario_id = $1`, [D])).rows[0];
ok(t2.vencido === true, 'ativar de novo não renova o teste grátis');
ok((await sql(`select nome from imobempregos.perfis where id = $1`, [D])).rows[0].nome === 'Dono da Doceria', '  nem troca o perfil');
await como('anon', null, async () => {
  ok(!!(await erro(() => sql(`select imobempregos.ativar_conta('X Y', '31977776666')`))), 'anon não chama ativar_conta');
});
await como('authenticated', null, async () => {
  ok(!!(await erro(() => sql(`select imobempregos.ativar_conta('X Y', '31977776666')`))), 'sem usuário no token, ativar_conta recusa');
});

// ---- IA: limite mensal, só o servidor conta
const consumir = (uid, lim) => sql(`select imobempregos.consumir_uso_ia($1, $2) as n`, [uid, lim]).then((r) => r.rows[0].n);
ok((await consumir(B, 2)) === 1 && (await consumir(B, 2)) === 2, 'servidor conta os usos da IA');
ok((await consumir(B, 2)) === -1, 'passou do limite do mês: recusa (-1)');
ok((await sql(`select usos from imobempregos.uso_ia where usuario_id = $1`, [B])).rows[0].usos === 2, '  e não conta além do limite');
await sql(`select imobempregos.devolver_uso_ia($1)`, [B]);
ok((await consumir(B, 2)) === 2, 'IA falhou: o uso é devolvido');
await como('authenticated', B, async () => {
  ok((await sql(`select usos from imobempregos.uso_ia`)).rows[0].usos === 2, 'usuário lê o próprio uso (contador)');
});
for (const [q, caso] of [
  [`select imobempregos.consumir_uso_ia('${B}', 999)`, 'usuário não chama consumir_uso_ia'],
  [`select imobempregos.devolver_uso_ia('${B}')`, 'usuário não chama devolver_uso_ia'],
  [`update imobempregos.uso_ia set usos = 0`, 'usuário não zera o próprio uso'],
]) {
  await como('authenticated', B, async () => { ok(!!(await erro(() => sql(q))), caso); });
}
await como('authenticated', D, async () => {
  ok((await sql(`select * from imobempregos.uso_ia`)).rows.length === 0, 'D não vê o uso de B');
});

// ---- candidaturas: só pagantes
const marcar = (uid, url) => como('authenticated', uid, () => sql(`select imobempregos.marcar_candidatura($1, 'Analista Fiscal', 'PagBank', 72, '{SPED}')`, [url]));
const pagante = (uid) => como('authenticated', uid, async () => (await sql(`select imobempregos.e_pagante() as p`)).rows[0].p);
ok((await pagante(B)) === false, 'teste grátis não é pagante');
ok(!!(await erro(() => marcar(B, 'https://pagbank.gupy.io/jobs/77'))), 'teste grátis não marca candidatura');
await sql(`update imobempregos.assinaturas set status = 'ativa', acesso_ate = now() + interval '30 days' where usuario_id = $1`, [B]);
ok((await pagante(B)) === true, 'pagou: é pagante');
await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${B}', true);
  select imobempregos.marcar_candidatura('https://pagbank.gupy.io/jobs/77', 'Analista Fiscal', 'PagBank', 72, '{SPED}'); commit;`);
const cand = (await sql(`select status, nota, candidatou_em is not null as data from imobempregos.vagas_usuario where usuario_id = $1`, [B])).rows[0];
ok(cand && cand.status === 'candidatei' && cand.nota === 72 && cand.data, 'pagante marca candidatura (cria a vaga no cache)');
ok(!!(await erro(() => marcar(B, 'javascript:alert(1)'))), 'candidatura com link inválido recusada');
await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${B}', true);
  select imobempregos.marcar_candidatura('https://www.linkedin.com/jobs/view/123', 'Analista', 'Empresa'); commit;`);
ok((await sql(`select fonte from imobempregos.vagas where url = 'https://www.linkedin.com/jobs/view/123'`)).rows[0].fonte === 'link', 'candidatura de vaga do LinkedIn (pelo link) funciona');
await como('authenticated', B, async () => {
  ok((await sql(`update imobempregos.vagas_usuario set status = 'entrevista' returning status`)).rows[0].status === 'entrevista', 'pagante muda o status');
});
await como('anon', null, async () => {
  ok(!!(await erro(() => sql(`select imobempregos.marcar_candidatura('https://e.gupy.io/jobs/5', 'x')`))), 'anon não marca candidatura');
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exitCode = falhas ? 1 : 0;
