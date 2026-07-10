// Helpers de autenticação por PIN.
// Estratégia: cada funcionário tem um "email" interno do tipo `{slug}@estoque.local`
// e a senha do Supabase Auth = o PIN. Assim reaproveitamos o Auth do Cloud sem
// expor emails reais.

import { supabase } from "@/integrations/supabase/client";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function emailFromSlug(slug: string): string {
  return `${slug}@users.baixonoroeste.com.br`;
}


// Sufixo fixo aplicado ao PIN antes de virar senha do Auth.
// O Supabase Auth exige senha com no mínimo 6 caracteres; a UX pede PIN de
// 6 a 8 dígitos (regra da Baixo Noroeste). Concatenamos o sufixo por segurança
// e para manter o mapeamento consistente. Não é secreto — só padroniza o mapeamento.
const PIN_SUFFIX = "#estq";
export const PIN_MIN = 6;
export const PIN_MAX = 8;
export function pinToPassword(pin: string): string {
  return `${pin}${PIN_SUFFIX}`;
}

export async function signInWithPin(slug: string, pin: string) {
  return supabase.auth.signInWithPassword({ email: emailFromSlug(slug), password: pinToPassword(pin) });
}

// signUpWithPin foi removido: auto-cadastro público é vetor de ataque.
// Primeiro admin usa `bootstrapFirstAdmin` (server-side, bloqueia após o setup).
// Demais usuários são criados via `createUserAsAdmin` por um admin autenticado.



