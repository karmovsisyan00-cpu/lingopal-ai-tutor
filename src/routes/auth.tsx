import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mic, Trophy, BookOpen } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Lingua" },
      { name: "description", content: "Sign in to your AI Language Tutor." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/", replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-60">
        <div className="absolute top-20 -left-20 w-72 h-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute bottom-10 -right-20 w-80 h-80 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <Link to="/" className="flex items-center gap-2 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="font-display text-2xl font-bold tracking-tight">Lingua</span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold mb-2">{mode === "signin" ? "Welcome back" : "Start learning"}</h1>
        <p className="text-muted-foreground mb-6">
          {mode === "signin" ? "Continue your language journey." : "Practice languages with an AI tutor."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:border-primary outline-none transition"
              required
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:border-primary outline-none transition"
            required
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            minLength={6}
            className="w-full h-12 px-4 rounded-xl bg-input border border-border focus:border-primary outline-none transition"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-95 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-6"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <div className="grid grid-cols-3 gap-3 mt-10 text-center">
          <Feature icon={<Mic className="w-4 h-4" />} label="Voice chat" />
          <Feature icon={<BookOpen className="w-4 h-4" />} label="Grammar tips" />
          <Feature icon={<Trophy className="w-4 h-4" />} label="Daily streaks" />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <div className="w-9 h-9 rounded-xl glass grid place-items-center text-primary-glow">{icon}</div>
      {label}
    </div>
  );
}
