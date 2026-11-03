import { gerarDocumentos } from '../analisador-curriculo/lib/servidor/ia.mjs';

export function POST(request) { return gerarDocumentos(request, process.env); }
