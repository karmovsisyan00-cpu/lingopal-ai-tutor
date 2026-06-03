import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getThread } from "@/lib/data.functions";
import { chatWithTutor } from "@/lib/ai.functions";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, MicOff, Send, Volume2, BookOpen } from "lucide-react";
import { flagFor } from "@/lib/languages";
import { useVoiceRecognition, speak } from "@/lib/useVoice";

export const Route = createFileRoute("/_app/chat/$threadId")({
  component: ChatPage,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  correction?: string | null;
  explanation?: string | null;
  vocab?: { word: string; meaning: string }[] | null;
};

function ChatPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchThread = useServerFn(getThread);
  const sendFn = useServerFn(chatWithTutor);

  const { data, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => fetchThread({ data: { id: threadId } }),
  });

  useEffect(() => {
    if (data === null) navigate({ to: "/" });
  }, [data, navigate]);

  const language = data?.thread.language ?? "English";
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { listening, transcript, supported, start, stop } = useVoiceRecognition(language);

  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [data?.messages.length]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId]);

  const sendMut = useMutation({
    mutationFn: (text: string) => sendFn({ data: { threadId, message: text } }),
    onMutate: (text) => {
      // optimistic
      qc.setQueryData(["thread", threadId], (prev: { thread: unknown; messages: Msg[] } | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            { id: `tmp-${Date.now()}`, role: "user", content: text },
          ],
        };
      });
    },
    onSuccess: (reply) => {
      qc.invalidateQueries({ queryKey: ["thread", threadId] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (reply.reply) speak(reply.reply, language);
    },
  });

  function submit() {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    setInput("");
    sendMut.mutate(text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-30 glass border-b border-border px-3 py-3 flex items-center gap-2">
        <Link to="/" className="w-9 h-9 grid place-items-center rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{flagFor(language)}</span>
            <div className="font-semibold truncate">{data?.thread.title}</div>
          </div>
          <div className="text-xs text-muted-foreground">{language} · {data?.thread.level}</div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading && <div className="text-center text-sm text-muted-foreground">Loading…</div>}
        {data?.messages.length === 0 && (
          <EmptyState language={language} onPick={(s) => setInput(s)} />
        )}
        {data?.messages.map((m) => (
          <MessageBubble key={m.id} m={m as Msg} language={language} />
        ))}
        {sendMut.isPending && <TypingIndicator />}
        {sendMut.isError && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {(sendMut.error as Error).message}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 glass border-t border-border p-3 safe-bottom">
        <div className="flex items-end gap-2">
          <button
            onClick={() => (listening ? stop() : start())}
            disabled={!supported}
            className={`shrink-0 w-12 h-12 rounded-2xl grid place-items-center transition ${
              listening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-surface-elevated border border-border text-primary-glow disabled:opacity-40"
            }`}
            aria-label={listening ? "Stop recording" : "Start voice input"}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={listening ? "Listening…" : `Reply in ${language}…`}
            className="flex-1 resize-none max-h-32 px-4 py-3 rounded-2xl bg-input border border-border focus:border-primary outline-none text-sm"
          />
          <button
            onClick={submit}
            disabled={!input.trim() || sendMut.isPending}
            className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-primary text-primary-foreground grid place-items-center shadow-glow disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m, language }: { m: Msg; language: string }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        <div
          className={
            isUser
              ? "bg-gradient-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-md shadow-soft text-sm leading-relaxed"
              : "text-foreground text-[15px] leading-relaxed"
          }
        >
          {m.content}
        </div>

        {!isUser && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => speak(m.content, language)}
              className="text-xs text-muted-foreground hover:text-primary-glow flex items-center gap-1"
            >
              <Volume2 className="w-3 h-3" /> Play
            </button>
          </div>
        )}

        {!isUser && m.correction && (
          <div className="mt-2 rounded-2xl border border-success/40 bg-success/10 p-3 text-sm">
            <div className="flex items-center gap-1 text-xs text-success font-semibold uppercase tracking-wider mb-1">
              <BookOpen className="w-3 h-3" /> Correction
            </div>
            <div className="text-foreground">{m.correction}</div>
            {m.explanation && (
              <div className="text-xs text-muted-foreground mt-1">{m.explanation}</div>
            )}
          </div>
        )}

        {!isUser && m.vocab && m.vocab.length > 0 && (
          <div className="mt-2 rounded-2xl border border-border bg-surface p-3">
            <div className="text-xs text-accent font-semibold uppercase tracking-wider mb-2">Vocabulary</div>
            <ul className="space-y-1">
              {m.vocab.map((v, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="font-semibold text-foreground">{v.word}</span>
                  <span className="text-muted-foreground">— {v.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center text-muted-foreground px-1">
      <span className="w-2 h-2 rounded-full bg-primary-glow animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 rounded-full bg-primary-glow animate-bounce" style={{ animationDelay: "120ms" }} />
      <span className="w-2 h-2 rounded-full bg-primary-glow animate-bounce" style={{ animationDelay: "240ms" }} />
    </div>
  );
}

function EmptyState({ language, onPick }: { language: string; onPick: (s: string) => void }) {
  const starters = [
    `Hello! Let's practice ${language}.`,
    `Can you teach me 3 useful phrases?`,
    `Let's roleplay ordering coffee.`,
    `Ask me a question to start.`,
  ];
  return (
    <div className="text-center pt-10">
      <div className="text-5xl mb-3">{flagFor(language)}</div>
      <p className="text-muted-foreground text-sm mb-5">Send a message to begin. Try one of these:</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {starters.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-xs px-3 py-2 rounded-full glass border border-border hover:border-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
