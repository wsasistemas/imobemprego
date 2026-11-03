// POST /api/asaas-webhook (Vercel Function, Node). A lógica e os testes ficam em analisador-curriculo/lib/servidor/acoes.mjs.
// Cadastre no Asaas (Integrações > Webhooks): https://<site>/api/asaas-webhook, com o token de ASAAS_WEBHOOK_TOKEN.
// As variáveis de ambiente vêm do painel da Vercel (Settings > Environment Variables).
import { webhookAsaas } from '../analisador-curriculo/lib/servidor/acoes.mjs';

export function POST(request) {
  return webhookAsaas(request, process.env);
}
