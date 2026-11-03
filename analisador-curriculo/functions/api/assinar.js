// POST /api/assinar { forma: "PIX" | "CREDIT_CARD", cpf }  (Cloudflare Pages Function)
import { assinar } from '../../lib/servidor/acoes.mjs';
export const onRequestPost = ({ request, env }) => assinar(request, env);
