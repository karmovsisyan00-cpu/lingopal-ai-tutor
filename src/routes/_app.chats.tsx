import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listThreads, deleteThread } from "@/lib/data.functions";
import { BottomNav } from "@/components/BottomNav";
import { ArrowRight, MessageCircle, Trash2 } from "lucide-react";
import { flagFor } from "@/lib/languages";

export const Route = createFileRoute("/_app/chats")({
  component: ChatsPage,
});

function ChatsPage() {
  const qc = useQueryClient();
  const fetchThreads = useServerFn(listThreads);
  const delFn = useServerFn(deleteThread);
  const { data: threads } = useQuery({ queryKey: ["threads"], queryFn: () => fetchThreads() });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["threads"] }),
  });

  return (
    <div className="min-h-dvh max-w-md mx-auto pb-24">
      <header className="px-5 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Your chats</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick up where you left off.</p>
      </header>

      <div className="px-5">
        {!threads?.length ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="w-6 h-6 mx-auto mb-2 text-primary-glow" />
            No conversations yet.
            <div className="mt-4">
              <Link to="/" className="text-primary-glow text-sm">Start one from Home →</Link>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {threads.map((t) => (
              <li key={t.id} className="flex items-stretch gap-2">
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="flex-1 flex items-center gap-3 p-3 rounded-2xl bg-surface hover:bg-surface-elevated border border-border transition"
                >
                  <span className="text-2xl">{flagFor(t.language)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.language} · {t.level}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </Link>
                <button
                  onClick={() => { if (confirm("Delete this chat?")) delMut.mutate(t.id); }}
                  className="w-12 rounded-2xl bg-surface border border-border text-muted-foreground hover:text-destructive grid place-items-center"
                  aria-label="Delete chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
