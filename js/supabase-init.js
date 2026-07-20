// ─────────────────────────────────────────────────────────────
//  Conexión con Supabase — APP DE DESARROLLO (Cifra)
//  Apunta a STAGING por defecto. Este app NO es el de operación de
//  Cremina. (Si algún día se necesita, ?prod apunta a producción.)
// ─────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROD = {
  url: "https://ntnyqezytwvwidzsleye.supabase.co",
  key: "sb_publishable_0ac28fHoDp-jW-CiVD-zAA_dtuylypF",
};
const STAGING = {
  url: "https://addlnoyoqswpshwbmzsf.supabase.co",
  key: "sb_publishable_RcIv7KMypzVBqzpR8KItog_ebeE0WkH",
};

// Dev app: staging por defecto; ?prod solo si se necesita explícitamente.
export const ENV = new URLSearchParams(location.search).has("prod") ? "prod" : "staging";
const cfg = ENV === "staging" ? STAGING : PROD;

export const supabase = createClient(cfg.url, cfg.key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
