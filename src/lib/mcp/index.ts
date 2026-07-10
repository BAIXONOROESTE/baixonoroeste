import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listInventories from "./tools/list-inventories";
import getInventory from "./tools/get-inventory";
import searchProducts from "./tools/search-products";
import listLosses from "./tools/list-losses";
import myProfile from "./tools/my-profile";

// Emissor OAuth = host direto do Supabase (nunca o proxy .lovable.cloud).
// VITE_SUPABASE_PROJECT_ID é inlineado pelo Vite no build.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "baixo-noroeste-inventario",
  title: "Baixo Noroeste — Inventário",
  version: "0.1.0",
  instructions:
    "Ferramentas para consultar inventários, produtos, perdas e perfil do usuário do sistema de estoque Baixo Noroeste. Todas as ferramentas rodam como o usuário autenticado e respeitam RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [myProfile, listInventories, getInventory, searchProducts, listLosses],
});
