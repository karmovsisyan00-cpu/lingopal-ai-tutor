import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getProfile, listThreads, createThread } from "@/lib/data.functions";
import { getOrCreateDailyChallenge } from "@/lib/ai.functions";
import { LANGUAGES, LEVELS, flagFor, type Level } from "@/lib/languages";
import { BottomNav } from "@/components/BottomNav";
import { Flame, Sparkles, Plus, ArrowRight, Zap, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const fetchThreads = useServerFn(listThreads);
  const fetchChallenge = useServerFn(getOrCreateDailyChallenge);
  const newThread = useServerFn(createThread);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: threads } = useQuery({ queryKey: ["threads"], queryFn: () => fetchThreads() });

  const lang = profile?.preferred_language ?? "English";
  const level = (profile?.level ?? "Beginner") as Level;

  const { data: challenge } = useQuery({
    queryKey: ["challenge", lang, level],
    queryFn: () => fetchChallenge({ data: { language: lang, level } }),
    enabled: !!profile,
  });

  const [showNew, setShowNew] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { language: string; level: Level; native_language?: string }) =>
      newThread({ data: vars }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    },
  });

  return (
    <div className="min-h-dvh pb-24 max-w-md mx-auto">
      <header className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Hello{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}</div>
          <h1 className="text-2xl font-bold mt-1">Ready to learn?</h1>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Sign out"
        >
          Sign out
        </button>
      </header>

      <section className="px-5">
        <div className="rounded-3xl bg-gradient-card border border-border p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
                <Flame className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{profile?.streak_count ?? 0}</div>
                <div className="text-xs text-muted-foreground">day streak</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold flex items-center gap-1 justify-end">
                  <Zap className="w-5 h-5 text-accent" />
                  {profile?.xp ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">XP</div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-xl">{flagFor(lang)}</span>
            <span className="font-medium">{lang}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{level}</span>
          </div>
        </div>
      </section>

      {/* Daily challenge */}
      <section className="px-5 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Today's challenge</h2>
          <Link to="/challenges" className="text-xs text-primary-glow flex items-center gap-1">
            All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="rounded-3xl glass border border-border p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/20 grid place-items-center">
              <Star className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm leading-relaxed">{challenge?.prompt ?? "Loading your challenge..."}</p>
              {challenge && (
                <button
                  onClick={() => {
                    createMut.mutate({ language: lang, level });
                  }}
                  className="mt-3 text-sm font-medium text-primary-glow flex items-center gap-1"
                >
                  Start practicing <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* New chat */}
      <section className="px-5 mt-6">
        <button
          onClick={() => setShowNew(true)}
          className="w-full h-14 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-glow active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Start new conversation
        </button>
      </section>

      {/* Recent chats */}
      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent chats</h2>
        {!threads?.length ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <Sparkles className="w-5 h-5 mx-auto mb-2 text-primary-glow" />
            No chats yet. Tap "Start new conversation" above.
          </div>
        ) : (
          <ul className="space-y-2">
            {threads.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface hover:bg-surface-elevated border border-border transition"
                >
                  <span className="text-2xl">{flagFor(t.language)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.language} · {t.level}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showNew && (
        <NewChatSheet
          defaultLanguage={lang}
          defaultLevel={level}
          defaultNative={profile?.native_language ?? "English"}
          onClose={() => setShowNew(false)}
          onCreate={(language, level, native_language) => createMut.mutate({ language, level, native_language })}
          loading={createMut.isPending}
        />
      )}

      <BottomNav />
    </div>
  );
}

function NewChatSheet({
  defaultLanguage,
  defaultLevel,
  defaultNative,
  onClose,
  onCreate,
  loading,
}: {
  defaultLanguage: string;
  defaultLevel: Level;
  defaultNative: string;
  onClose: () => void;
  onCreate: (lang: string, level: Level, native: string) => void;
  loading: boolean;
}) {
  const [lang, setLang] = useState(defaultLanguage);
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [native, setNative] = useState(defaultNative);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md mx-auto bg-surface-elevated border-t border-border rounded-t-3xl p-5 pb-8 safe-bottom max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-border rounded-full mx-auto mb-4" />
        <h3 className="text-lg font-bold mb-1">New conversation</h3>
        <p className="text-sm text-muted-foreground mb-5">Pick what you want to learn and the language you'll get explanations in.</p>

        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">I want to learn</label>
          <div className="grid grid-cols-2 gap-2 mt-2 max-h-44 overflow-y-auto scrollbar-hide">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`flex items-center gap-2 px-3 h-11 rounded-xl border text-sm transition ${
                  lang === l.code
                    ? "bg-primary/15 border-primary text-foreground"
                    : "bg-input border-border text-muted-foreground"
                }`}
              >
                <span className="text-lg">{l.flag}</span> {l.code}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Explain to me in</label>
          <div className="grid grid-cols-2 gap-2 mt-2 max-h-44 overflow-y-auto scrollbar-hide">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setNative(l.code)}
                className={`flex items-center gap-2 px-3 h-11 rounded-xl border text-sm transition ${
                  native === l.code
                    ? "bg-accent/20 border-accent text-foreground"
                    : "bg-input border-border text-muted-foreground"
                }`}
              >
                <span className="text-lg">{l.flag}</span> {l.code}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Level</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                onClick={() => setLevel(lv)}
                className={`h-11 rounded-xl border text-sm font-medium transition ${
                  level === lv
                    ? "bg-primary/15 border-primary text-foreground"
                    : "bg-input border-border text-muted-foreground"
                }`}
              >
                {lv}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onCreate(lang, level, native)}
          disabled={loading}
          className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-60"
        >
          {loading ? "Creating..." : "Start chat"}
        </button>
      </div>
    </div>
  );
}
