// POST /api/asaas-webhook  (Cloudflare Pages Function)
// Cadastre esta URL no Asaas (Integrações > Webhooks) com o mesmo token de ASAAS_WEBHOOK_TOKEN.
import { webhookAsaas } from '../../lib/servidor/acoes.mjs';
export const onRequestPost = ({ request, env }) => webhookAsaas(request, env);
