import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, createThread } from "@/lib/data.functions";
import { getOrCreateDailyChallenge, completeDailyChallenge } from "@/lib/ai.functions";
import { BottomNav } from "@/components/BottomNav";
import { Flame, Check, Sparkles } from "lucide-react";
import type { Level } from "@/lib/languages";

export const Route = createFileRoute("/_app/challenges")({
  component: ChallengesPage,
});

function ChallengesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const fetchChallenge = useServerFn(getOrCreateDailyChallenge);
  const completeFn = useServerFn(completeDailyChallenge);
  const newThread = useServerFn(createThread);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const lang = profile?.preferred_language ?? "English";
  const level = (profile?.level ?? "Beginner") as Level;

  const { data: challenge } = useQuery({
    queryKey: ["challenge", lang, level],
    queryFn: () => fetchChallenge({ data: { language: lang, level } }),
    enabled: !!profile,
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => completeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenge", lang, level] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const startChat = useMutation({
    mutationFn: () => newThread({ data: { language: lang, level, title: "Daily challenge" } }),
    onSuccess: (t) => navigate({ to: "/chat/$threadId", params: { threadId: t.id } }),
  });

  return (
    <div className="min-h-dvh max-w-md mx-auto pb-24">
      <header className="px-5 pt-8 pb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Daily</div>
        <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
          <Flame className="w-6 h-6 text-accent" /> Today's challenge
        </h1>
      </header>

      <section className="px-5">
        <div className="rounded-3xl bg-gradient-card border border-border p-6 shadow-soft">
          <div className="text-xs text-muted-foreground mb-2">
            {lang} · {level} · +{challenge?.xp_reward ?? 20} XP
          </div>
          <p className="text-lg leading-relaxed">{challenge?.prompt ?? "Generating your challenge…"}</p>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => startChat.mutate()}
              disabled={startChat.isPending}
              className="flex-1 h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-glow"
            >
              Practice now
            </button>
            {challenge && !challenge.completed && (
              <button
                onClick={() => completeMut.mutate(challenge.id)}
                disabled={completeMut.isPending}
                className="h-12 px-4 rounded-xl bg-success/15 text-success border border-success/40"
              >
                <Check className="w-5 h-5" />
              </button>
            )}
            {challenge?.completed && (
              <div className="h-12 px-4 rounded-xl bg-success/15 text-success border border-success/40 grid place-items-center">
                <Check className="w-5 h-5" />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">How it works</h2>
        <ul className="space-y-3 text-sm">
          {[
            "A fresh challenge appears every day, tailored to your language and level.",
            "Tap Practice to start a chat focused on the challenge topic.",
            "Mark complete to earn bonus XP and keep your streak alive.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3 p-3 rounded-2xl bg-surface border border-border">
              <Sparkles className="w-4 h-4 mt-0.5 text-primary-glow shrink-0" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <BottomNav />
    </div>
  );
}
