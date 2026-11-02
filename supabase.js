// Твой URL (смотри адресную строку на скрине)
export const SUPABASE_URL = "https://cfvetylxmtqwvmjzoxey.supabase.co";

// Твой ПУБЛИЧНЫЙ ключ (Publishable key с первого скрина)
export const SUPABASE_ANON_KEY = "sb_publishable_FU-IWK9EmXOmp1z6mmahMQ_zhty25zO";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);