// Configuração pública do app. Estes dois valores PODEM ficar na página:
// a chave "publishable" do Supabase foi feita para o navegador, e o acesso aos
// dados é controlado pelo RLS do banco.
// NUNCA coloque aqui a chave "secret" (sb_secret_...): ela fica só na Vercel.
//
// Onde achar: Supabase > Project Settings > API Keys.
window.IMOB_CONFIG = {
  supabaseUrl: '',          // ex.: 'https://abcdefghijklm.supabase.co'
  supabasePublishableKey: '', // ex.: 'sb_publishable_...'
};
