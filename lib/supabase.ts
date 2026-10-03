/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const DEFAULT_QA_SUPABASE_URL = "https://adbbqlbnrrzlzhlbzkhu.supabase.co";
const DEFAULT_QA_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkYmJxbGJucnJ6bHpsYnpraHUiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4ODI4MDY4MCwiZXhwIjoyMTAzODU2NjgwfQ.q02k7tJtY4eP1-q2iFk_G0y03m7t66t-T7ZpQ2-8Vb8";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_QA_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_QA_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

export const hasSupabaseConfig = !!(supabaseUrl && supabaseAnonKey);
