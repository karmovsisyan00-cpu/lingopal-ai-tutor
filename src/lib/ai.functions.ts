import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const ChatInput = z.object({
  threadId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

type Vocab = { word: string; meaning: string }[];

type AiReply = {
  reply: string;
  correction: string | null;
  explanation: string | null;
  vocab: Vocab;
};

function buildSystemPrompt(language: string, level: string) {
  return `You are a warm, encouraging AI language tutor helping the user learn ${language} at the ${level} level.

Rules:
- Always reply in ${language}, adapted to ${level} level (simpler for Beginner, richer for Advanced).
- Keep the conversation natural, ask one follow-up question.
- Look at the user's last message. If it contains grammar, spelling, or word-choice mistakes in ${language}, provide a corrected version and a short explanation in English. If the user wrote in English while learning ${language}, gently translate it into ${language}.
- Suggest 2-4 useful vocabulary words from your reply with short English meanings.

You MUST respond as a single JSON object with exactly these keys:
{
  "reply": "your conversational reply in ${language}",
  "correction": "corrected version of the user's last message, or null if no correction needed",
  "explanation": "brief English explanation of the correction, or null",
  "vocab": [{"word":"...","meaning":"..."}]
}
No markdown, no code fences, only valid JSON.`;
}

export const chatWithTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data, context }): Promise<AiReply> => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Load thread to confirm ownership + get language/level
    const { data: thread, error: tErr } = await supabase
      .from("threads")
      .select("id, language, level")
      .eq("id", data.threadId)
      .single();
    if (tErr || !thread) throw new Error("Thread not found");

    // Save user message
    const { error: insErr } = await supabase.from("messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "user",
      content: data.message,
    });
    if (insErr) throw new Error(insErr.message);

    // Load short history (last 20)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const messages = [
      { role: "system", content: buildSystemPrompt(thread.language, thread.level) },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please slow down and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in Lovable workspace settings.");
      throw new Error(`AI request failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: AiReply;
    try {
      const obj = JSON.parse(raw);
      parsed = {
        reply: String(obj.reply ?? ""),
        correction: obj.correction ?? null,
        explanation: obj.explanation ?? null,
        vocab: Array.isArray(obj.vocab) ? obj.vocab.slice(0, 6) : [],
      };
    } catch {
      parsed = { reply: String(raw), correction: null, explanation: null, vocab: [] };
    }

    // Save assistant message
    await supabase.from("messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "assistant",
      content: parsed.reply,
      correction: parsed.correction,
      explanation: parsed.explanation,
      vocab: parsed.vocab,
    });

    // Bump thread updated_at + xp + streak
    await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", thread.id);

    const today = new Date().toISOString().slice(0, 10);
    const { data: prof } = await supabase
      .from("profiles")
      .select("xp, streak_count, last_active_date")
      .eq("id", userId)
      .maybeSingle();

    if (prof) {
      let newStreak = prof.streak_count ?? 0;
      const last = prof.last_active_date;
      if (last !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const ystr = y.toISOString().slice(0, 10);
        newStreak = last === ystr ? newStreak + 1 : 1;
      }
      await supabase.from("profiles").update({
        xp: (prof.xp ?? 0) + 5,
        streak_count: newStreak,
        last_active_date: today,
      }).eq("id", userId);

      // Achievements
      const totalXp = (prof.xp ?? 0) + 5;
      const toUnlock: { code: string; title: string; description: string; icon: string }[] = [];
      if (totalXp >= 50) toUnlock.push({ code: "xp_50", title: "Getting Started", description: "Earned 50 XP", icon: "sparkles" });
      if (totalXp >= 250) toUnlock.push({ code: "xp_250", title: "Dedicated Learner", description: "Earned 250 XP", icon: "flame" });
      if (newStreak >= 3) toUnlock.push({ code: "streak_3", title: "On a Roll", description: "3 day streak", icon: "flame" });
      if (newStreak >= 7) toUnlock.push({ code: "streak_7", title: "Week Warrior", description: "7 day streak", icon: "trophy" });
      for (const a of toUnlock) {
        await supabase.from("achievements").insert({ ...a, user_id: userId }).select().maybeSingle();
      }
    }

    return parsed;
  });

const ChallengeInput = z.object({ language: z.string(), level: z.string() });

export const getOrCreateDailyChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChallengeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("daily_challenges")
      .select("*")
      .eq("user_id", userId)
      .eq("challenge_date", today)
      .maybeSingle();
    if (existing) return existing;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You generate short, fun daily language-learning challenges." },
          {
            role: "user",
            content: `Generate ONE short daily learning challenge for a ${data.level} learner of ${data.language}. One sentence, in English, telling them what to practice today (e.g., "Describe what you ate for breakfast in ${data.language}."). Return only the sentence, no quotes.`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI failed: ${res.status}`);
    const j = await res.json();
    const prompt = String(j?.choices?.[0]?.message?.content ?? "").trim() || `Have a 3-sentence conversation in ${data.language} about your day.`;

    const { data: ins, error } = await supabase
      .from("daily_challenges")
      .insert({ user_id: userId, language: data.language, level: data.level, prompt, challenge_date: today })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const completeDailyChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ch, error } = await supabase
      .from("daily_challenges")
      .update({ completed: true })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { data: prof } = await supabase.from("profiles").select("xp").eq("id", userId).maybeSingle();
    await supabase.from("profiles").update({ xp: (prof?.xp ?? 0) + (ch.xp_reward ?? 20) }).eq("id", userId);
    return ch;
  });
