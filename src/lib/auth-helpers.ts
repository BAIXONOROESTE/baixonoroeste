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
  return `${slug}@estoque.local`;
}

// Sufixo fixo aplicado ao PIN antes de virar senha do Auth.
// O Supabase Auth exige senha com no mínimo 6 caracteres; a UX pede PIN de
// 4 a 8 dígitos. Concatenamos o sufixo para satisfazer o mínimo sem mexer
// na configuração global do Auth. Não é secreto — só padroniza o mapeamento.
const PIN_SUFFIX = "#estq";
export function pinToPassword(pin: string): string {
  return `${pin}${PIN_SUFFIX}`;
}

export async function signInWithPin(slug: string, pin: string) {
  return supabase.auth.signInWithPassword({ email: emailFromSlug(slug), password: pinToPassword(pin) });
}

export async function signUpWithPin(opts: {
  fullName: string;
  slug: string;
  pin: string;
  avatarColor?: string;
}) {
  // IMPORTANT: never send `role` in signup metadata. The DB trigger
  // (`handle_new_user`) ignores client-supplied roles — only the very first
  // user of the system becomes admin automatically; all others default to
  // `contador` and must be elevated by an authenticated admin.
  return supabase.auth.signUp({
    email: emailFromSlug(opts.slug),
    password: pinToPassword(opts.pin),
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        full_name: opts.fullName,
        slug: opts.slug,
        avatar_color: opts.avatarColor ?? "amber",
      },
    },
  });
}


