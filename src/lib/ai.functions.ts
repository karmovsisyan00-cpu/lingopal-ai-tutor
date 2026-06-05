import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LANGUAGES } from "@/lib/languages";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Use a stronger model for higher linguistic accuracy, especially for
// lower-resource languages like Armenian.
const MODEL = "openai/gpt-5.5";

const LANG_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];
const LanguageEnum = z.enum(LANG_CODES);
const LevelEnum = z.enum(["Beginner", "Intermediate", "Advanced"]);

function safeLang(v: unknown, fallback = "English"): string {
  return typeof v === "string" && (LANG_CODES as readonly string[]).includes(v) ? v : fallback;
}
function safeLevel(v: unknown, fallback = "Beginner"): string {
  return v === "Beginner" || v === "Intermediate" || v === "Advanced" ? v : fallback;
}
function logAndFail(scope: string, error: unknown, userMessage = "Operation failed"): never {
  console.error(`[ai:${scope}]`, error);
  throw new Error(userMessage);
}

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

const LATIN_LETTERS = /[A-Za-z]/;

function containsLatinLetters(value: unknown): value is string {
  return typeof value === "string" && LATIN_LETTERS.test(value);
}

function forceArmenianOnly(reply: AiReply): AiReply {
  return {
    reply: containsLatinLetters(reply.reply) ? "Լավ, սկսենք պարզ հարցից։ Ինչպե՞ս ես այսօր։" : reply.reply,
    correction: containsLatinLetters(reply.correction) ? null : reply.correction,
    explanation: containsLatinLetters(reply.explanation)
      ? "Նախադասությունը հարմարեցվել է բնական, ժամանակակից արևելահայերեն խոսքին։"
      : reply.explanation,
    vocab: reply.vocab
      .filter((item) => !containsLatinLetters(item.word))
      .map((item) => ({
        word: String(item.word ?? ""),
        meaning: containsLatinLetters(item.meaning) ? "օգտակար բառ զրույցից" : String(item.meaning ?? ""),
      }))
      .filter((item) => item.word.trim().length > 0)
      .slice(0, 4),
  };
}

function buildSystemPrompt(language: string, level: string, nativeLanguage: string) {
  const sameLang = language.toLowerCase() === nativeLanguage.toLowerCase();
  const targetIsArmenian = language.toLowerCase() === "armenian";
  const nativeIsArmenian = nativeLanguage.toLowerCase() === "armenian";
  const anyArmenianOutput = targetIsArmenian || nativeIsArmenian;
  const explanationLanguage = targetIsArmenian ? "Armenian" : nativeLanguage;
  const armenianRules = anyArmenianOutput
    ? `

Armenian-specific rules (CRITICAL):
- ANY Armenian text you produce — reply, correction, explanation, vocabulary meanings, examples — must be ONLY clean Modern Eastern Armenian: մաքուր ժամանակակից արևելահայերեն / աշխարհաբար։
- Do NOT use Classical Armenian (գրաբար), Middle Armenian, Western Armenian, church/liturgical language, old literary wording, dialect, slang, or Latin transliteration.
- Absolutely forbidden Armenian forms/words: "դուն", "կը" as present-tense marker, "ըսել", "երթալ", "եղեր է", "զի", "քանզի", "ուստի", "սույն", "վասն", "ի վերայ", "որպէսզի", "յետոյ", "պիտի" when it sounds Western/archaic. Use ordinary Eastern Armenian instead.
- Prefer normal Yerevan/Eastern Armenian wording: "դու", "ես ասում եմ", "ասել", "գնալ", "հետո", "որովհետև", "այս", "տանը", "երեխա", "տղա", "աղջիկ", "սովորել", "խոսել".
- No unnecessary Russian, Turkish, Persian, or English loanwords when a common Armenian word exists. Do not write foreign slang in Armenian letters.
- Use correct Eastern Armenian grammar: definite articles -ը/-ն, noun cases, natural word order, and verbs like "եմ/ես/է/ենք/եք/են", "անում եմ", "արեցի", "արել եմ".
- Use reformed modern Eastern Armenian spelling and Armenian script only for Armenian: "և", "ու", correct "է/ե", "օ/ո", "ը". Never write Armenian with Latin letters.
- Use Armenian punctuation in Armenian text: end sentences with "։". Put "՞" on the stressed vowel of the question word when possible, not as a separate final "?". Avoid Latin ".", "?", "!" in Armenian sentences.
- Before returning JSON, silently reread every Armenian phrase and rewrite it if it sounds bookish, Western Armenian, archaic, translated word-for-word, or unnatural. Choose short simple correct Armenian over fancy wording.`
    : "";
  return `You are a precise, warm AI language tutor helping the user learn ${language} at the ${level} level. The user's native language is ${nativeLanguage}.

Conversation rules (very important):
- Answer ONLY the user's latest message, using the conversation history only for context.
- Never repeat your previous assistant reply. If your new reply sounds similar to your last reply, rewrite it with a new reaction, new information, and a new follow-up question.
- If the user gives a short answer such as "yes", "no", or a simple sentence, understand it as a response to your previous question and continue naturally.
- Keep the conversation moving forward with a fresh question or mini exercise.

Accuracy rules (very important):
- Your ${language} MUST be grammatically correct, natural, and idiomatic. Double-check spelling, articles, gender, cases, verb conjugation, and word order before you reply.
- Adapt vocabulary and sentence length to ${level}: simple short sentences for Beginner, richer for Advanced.
- Never invent words. If unsure of a word in ${language}, use a simpler well-known alternative.
- Keep replies focused: 1–3 short sentences plus one natural follow-up question.

Correction rules:
- If the user's last message has any grammar, spelling, word-choice, or punctuation issue in ${language}, provide a corrected version of THEIR message in ${language}.
- The correction MUST preserve the user's exact meaning. Do not add ideas from earlier messages and do not replace the user's sentence with your own sentence.
- If the user wrote in ${nativeLanguage} (or another language) while learning ${language}, translate only their exact latest message into correct ${language} as the "correction".
- Write the "explanation" in ${explanationLanguage}${targetIsArmenian ? " only, using clean Modern Eastern Armenian" : sameLang ? "" : ` (NOT in ${language})`}, short and clear, explaining WHY the correction was made.
- If the user's message is already perfect, set "correction" and "explanation" to null.

Vocabulary:
- Suggest 2–4 useful words taken from your own reply, with short meanings written in ${explanationLanguage}.
- If ${language} is Armenian, the reply, correction, explanation, vocabulary words, and vocabulary meanings must ALL be in Armenian only. Do not use English anywhere in the JSON values.
- If ${nativeLanguage} is Armenian, explanations and vocabulary meanings must follow the Armenian-specific rules exactly.

You MUST respond as a single JSON object with exactly these keys:
{
  "reply": "your conversational reply in ${language}",
  "correction": "corrected version of the user's last message in ${language}, or null",
  "explanation": "brief explanation in ${nativeLanguage}, or null",
  "vocab": [{"word":"word in ${language}","meaning":"meaning in ${nativeLanguage}"}]
}
No markdown, no code fences, only valid JSON.${armenianRules}`;
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
      .select("id, language, level, native_language")
      .eq("id", data.threadId)
      .single();
    if (tErr || !thread) {
      if (tErr) console.error("[ai:chat.thread]", tErr);
      throw new Error("Thread not found");
    }

    // Save user message
    const { error: insErr } = await supabase.from("messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "user",
      content: data.message,
    });
    if (insErr) logAndFail("chat.insertUserMessage", insErr, "Failed to save message");

    // Load recent history, then restore chronological order for the model.
    const { data: recentHistory } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const history = (recentHistory ?? []).reverse();

    const safeLanguage = safeLang(thread.language);
    const safeLevelValue = safeLevel(thread.level);
    const safeNative = safeLang(thread.native_language, "English");

    const messages = [
      { role: "system", content: buildSystemPrompt(safeLanguage, safeLevelValue, safeNative) },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
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

    const finalReply = safeLanguage.toLowerCase() === "armenian" || safeNative.toLowerCase() === "armenian"
      ? forceArmenianOnly(parsed)
      : parsed;

    // Save assistant message
    await supabase.from("messages").insert({
      thread_id: thread.id,
      user_id: userId,
      role: "assistant",
      content: finalReply.reply,
      correction: finalReply.correction,
      explanation: finalReply.explanation,
      vocab: finalReply.vocab,
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

    return finalReply;
  });

const ChallengeInput = z.object({ language: LanguageEnum, level: LevelEnum });

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
      headers: { "Lovable-API-Key": apiKey, "Content-Type": "application/json" },
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
    if (!res.ok) {
      console.error("[ai:dailyChallenge]", res.status, await res.text().catch(() => ""));
      throw new Error("Could not generate a daily challenge. Please try again.");
    }
    const j = await res.json();
    const prompt = String(j?.choices?.[0]?.message?.content ?? "").trim() || `Have a 3-sentence conversation in ${data.language} about your day.`;

    const { data: ins, error } = await supabase
      .from("daily_challenges")
      .insert({ user_id: userId, language: data.language, level: data.level, prompt, challenge_date: today })
      .select()
      .single();
    if (error) logAndFail("dailyChallenge.insert", error);
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
    if (error) logAndFail("completeChallenge", error);

    const { data: prof } = await supabase.from("profiles").select("xp").eq("id", userId).maybeSingle();
    await supabase.from("profiles").update({ xp: (prof?.xp ?? 0) + (ch.xp_reward ?? 20) }).eq("id", userId);
    return ch;
  });
