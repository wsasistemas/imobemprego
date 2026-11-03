// POST /api/cancelar  (Cloudflare Pages Function)
import { cancelar } from '../../lib/servidor/acoes.mjs';
export const onRequestPost = ({ request, env }) => cancelar(request, env);
