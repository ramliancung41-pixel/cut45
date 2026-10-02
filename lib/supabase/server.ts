import { createClient, type User } from "@supabase/supabase-js";

function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is missing.");
  return url;
}

export function createSupabaseAnonClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Supabase anon key is missing.");
  return createClient(supabaseUrl(), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Supabase service role key is missing.");
  return createClient(supabaseUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function userFromAccessToken(accessToken: string): Promise<User | null> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;
  return data.user;
}

export async function refreshSupabaseSession(refreshToken: string) {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user?.email) return null;
  return { session: data.session, user: data.user };
}
