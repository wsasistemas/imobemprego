import { lerLink } from '../analisador-curriculo/lib/servidor/link.mjs';

export function GET(request) { return lerLink(request, process.env); }
