import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ttsProviderTest } from "@/lib/ttsTest.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Play } from "lucide-react";

export const Route = createFileRoute("/_app/tts-test")({
  component: TtsTestPage,
  head: () => ({
    meta: [{ title: "TTS Test — LingoPal" }],
  }),
});

type Result = Awaited<ReturnType<typeof ttsProviderTest>>;

function TtsTestPage() {
  const [azure, setAzure] = useState<Result | null>(null);
  const [eleven, setEleven] = useState<Result | null>(null);
  const [loading, setLoading] = useState<"azure" | "elevenlabs" | null>(null);

  async function run(provider: "azure" | "elevenlabs") {
    setLoading(provider);
    try {
      const r = await ttsProviderTest({ data: { provider } });
      if (provider === "azure") setAzure(r);
      else setEleven(r);
    } catch (e) {
      const err: Result = {
        provider,
        ok: false,
        message: (e as Error).message,
      };
      if (provider === "azure") setAzure(err);
      else setEleven(err);
    } finally {
      setLoading(null);
    }
  }

  function play(r: Result | null) {
    if (!r?.audio || !r.mime) return;
    const audio = new Audio(`data:${r.mime};base64,${r.audio}`);
    void audio.play();
  }

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">TTS Configuration Test</h1>
      <p className="text-sm text-muted-foreground">
        Ստուգիր, արդյոք Azure Speech-ը (հայերեն) և ElevenLabs-ը (այլ լեզուներ) ճիշտ կազմաձևված են։
      </p>

      {(["azure", "elevenlabs"] as const).map((provider) => {
        const r = provider === "azure" ? azure : eleven;
        const isLoading = loading === provider;
        return (
          <Card key={provider} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold capitalize">{provider}</div>
                <div className="text-xs text-muted-foreground">
                  {provider === "azure" ? "hy-AM neural voices" : "Multilingual v2"}
                </div>
              </div>
              <div className="flex gap-2">
                {r?.audio && (
                  <Button size="sm" variant="outline" onClick={() => play(r)}>
                    <Play className="w-4 h-4" />
                  </Button>
                )}
                <Button size="sm" onClick={() => run(provider)} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                </Button>
              </div>
            </div>

            {r && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  {r.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  )}
                  <span>{r.message}</span>
                </div>
                {r.details && (
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(r.details, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
