import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, listAchievements, updateProfile } from "@/lib/data.functions";
import { BottomNav } from "@/components/BottomNav";
import { LANGUAGES, LEVELS, flagFor, type Level } from "@/lib/languages";
import { Trophy, Flame, Zap, Sparkles, Star } from "lucide-react";

export const Route = createFileRoute("/_app/progress")({
  component: ProgressPage,
});

const iconMap: Record<string, React.ReactNode> = {
  trophy: <Trophy className="w-5 h-5" />,
  flame: <Flame className="w-5 h-5" />,
  sparkles: <Sparkles className="w-5 h-5" />,
  star: <Star className="w-5 h-5" />,
};

function ProgressPage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const fetchAch = useServerFn(listAchievements);
  const updateFn = useServerFn(updateProfile);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: achievements } = useQuery({ queryKey: ["achievements"], queryFn: () => fetchAch() });

  const updateMut = useMutation({
    mutationFn: (vars: { preferred_language?: string; level?: Level; native_language?: string }) => updateFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  const xp = profile?.xp ?? 0;
  const nextMilestone = xp < 50 ? 50 : xp < 250 ? 250 : xp < 1000 ? 1000 : Math.ceil(xp / 1000) * 1000 + 500;
  const pct = Math.min(100, Math.round((xp / nextMilestone) * 100));

  return (
    <div className="min-h-dvh max-w-md mx-auto pb-24">
      <header className="px-5 pt-8 pb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Progress</div>
        <h1 className="text-2xl font-bold mt-1">Your journey</h1>
      </header>

      <section className="px-5">
        <div className="rounded-3xl bg-gradient-card border border-border p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-accent" />
              <span className="font-semibold">{xp} XP</span>
            </div>
            <span className="text-xs text-muted-foreground">{nextMilestone} XP next</span>
          </div>
          <div className="h-3 rounded-full bg-input overflow-hidden">
            <div className="h-full bg-gradient-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <Stat icon={<Flame className="w-4 h-4 text-accent" />} label="Streak" value={`${profile?.streak_count ?? 0}d`} />
            <Stat icon={<Trophy className="w-4 h-4 text-accent" />} label="Badges" value={String(achievements?.length ?? 0)} />
          </div>
        </div>
      </section>

      <section className="px-5 mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Preferences</h2>
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">I want to learn</label>
            <div className="mt-2 grid grid-cols-2 gap-2 max-h-44 overflow-y-auto scrollbar-hide">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => updateMut.mutate({ preferred_language: l.code })}
                  className={`h-10 px-3 rounded-xl text-sm flex items-center gap-2 border transition ${
                    profile?.preferred_language === l.code
                      ? "bg-primary/15 border-primary"
                      : "bg-input border-border text-muted-foreground"
                  }`}
                >
                  <span>{l.flag}</span> {l.code}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Explain to me in (native language)</label>
            <div className="mt-2 grid grid-cols-2 gap-2 max-h-44 overflow-y-auto scrollbar-hide">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => updateMut.mutate({ native_language: l.code })}
                  className={`h-10 px-3 rounded-xl text-sm flex items-center gap-2 border transition ${
                    profile?.native_language === l.code
                      ? "bg-accent/20 border-accent"
                      : "bg-input border-border text-muted-foreground"
                  }`}
                >
                  <span>{l.flag}</span> {l.code}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Level</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  onClick={() => updateMut.mutate({ level: lv })}
                  className={`h-10 rounded-xl text-sm border transition ${
                    profile?.level === lv ? "bg-primary/15 border-primary" : "bg-input border-border text-muted-foreground"
                  }`}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Achievements</h2>
        {!achievements?.length ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Keep chatting to unlock your first badge.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {achievements.map((a) => (
              <li key={a.id} className="rounded-2xl glass border border-border p-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary grid place-items-center shadow-glow text-primary-foreground mb-2">
                  {iconMap[a.icon] ?? <Trophy className="w-5 h-5" />}
                </div>
                <div className="font-semibold text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.description}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-5 mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Currently learning</h2>
        <div className="rounded-2xl bg-surface border border-border p-4 flex items-center gap-3">
          <span className="text-3xl">{flagFor(profile?.preferred_language ?? "English")}</span>
          <div>
            <div className="font-medium">{profile?.preferred_language}</div>
            <div className="text-xs text-muted-foreground">{profile?.level}</div>
          </div>
        </div>
      </section>

      <BottomNav />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
