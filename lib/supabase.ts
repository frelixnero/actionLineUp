import { createClient } from "@supabase/supabase-js";

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const required = (value: string | undefined, name: string) => {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

export const publicSupabase = () =>
  createClient(required(projectUrl, "NEXT_PUBLIC_SUPABASE_URL"), required(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"));

export const adminSupabase = () =>
  createClient(required(projectUrl, "NEXT_PUBLIC_SUPABASE_URL"), required(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}.user@actionlineup.local`;

export const signInIdentifierToEmail = (identifier: string) => {
  const clean = identifier.trim().toLowerCase();
  return clean.includes("@") ? clean : usernameToEmail(clean);
};
