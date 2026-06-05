import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LANGUAGES } from "@/lib/languages";

const LANG_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];
const LanguageEnum = z.enum(LANG_CODES);
const LevelEnum = z.enum(["Beginner", "Intermediate", "Advanced"]);

function logAndFail(scope: string, error: unknown, userMessage = "Database operation failed"): never {
  console.error(`[db:${scope}]`, error);
  throw new Error(userMessage);
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) logAndFail("getProfile", error);
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(80).optional(),
        preferred_language: LanguageEnum.optional(),
        native_language: LanguageEnum.optional(),
        level: LevelEnum.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: out, error } = await supabase
      .from("profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();
    if (error) logAndFail("updateProfile", error);
    return out;
  });

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) logAndFail("listThreads", error);
    return data;
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(120).optional(),
        language: LanguageEnum,
        level: LevelEnum,
        native_language: LanguageEnum.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let nativeLang = data.native_language;
    if (!nativeLang) {
      const { data: prof } = await supabase.from("profiles").select("native_language").eq("id", userId).maybeSingle();
      const candidate = prof?.native_language ?? "English";
      nativeLang = (LANG_CODES as readonly string[]).includes(candidate) ? candidate : "English";
    }
    const { data: out, error } = await supabase
      .from("threads")
      .insert({
        user_id: userId,
        title: data.title ?? `${data.language} chat`,
        language: data.language,
        level: data.level,
        native_language: nativeLang,
      })
      .select()
      .single();
    if (error) logAndFail("createThread", error);
    return out;
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("threads").delete().eq("id", data.id).eq("user_id", userId);
    if (error) logAndFail("deleteThread", error);
    return { ok: true };
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: thread, error } = await supabase
      .from("threads")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) logAndFail("getThread", error);
    if (!thread) return null;
    const { data: messages, error: mErr } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });
    if (mErr) logAndFail("getThread.messages", mErr);
    return { thread, messages: messages ?? [] };
  });

export const listAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("achievements")
      .select("*")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });
    if (error) logAndFail("listAchievements", error);
    return data;
  });
