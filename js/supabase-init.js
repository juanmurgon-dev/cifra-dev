// ─────────────────────────────────────────────────────────────
//  Conexión con Supabase — APP DE BETA (Platify multi-tenant)
//  Apunta al proyecto multi-tenant NUEVO. Cada restaurante crea su
//  espacio (org) al entrar y ve SOLO lo suyo (RLS por org, ya probada).
//  ⚠️ La app de operación de Cremina NO es esta; vive en gastos-cremina.
// ─────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BETA = {
  url: "https://ciphqvvekueeskrojejt.supabase.co",
  key: "sb_publishable__Bl0XtB2hZS_rp0OJZAfoA_u7wmoUwl",
};

export const ENV = "beta";

export const supabase = createClient(BETA.url, BETA.key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
