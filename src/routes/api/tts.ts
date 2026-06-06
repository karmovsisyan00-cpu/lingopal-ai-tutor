import { createFileRoute } from "@tanstack/react-router";

const VOICE_MAP: Record<string, string> = {
  George: "JBFqnCBsd6RMkjVDRZzb",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
};

const DEFAULT_VOICE_ID = VOICE_MAP.George;

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const apiKey = process.env.ELEVENLABS_API_KEY;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: "ElevenLabs not configured" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          const body = (await request.json()) as {
            text?: string;
            voice?: string;
            voiceId?: string;
          };

          const text = (body.text ?? "").toString().slice(0, 4000).trim();
          if (!text) {
            return new Response(
              JSON.stringify({ error: "text is required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const voiceId =
            body.voiceId ||
            (body.voice && VOICE_MAP[body.voice]) ||
            DEFAULT_VOICE_ID;

          const r = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                  stability: 0.45,
                  similarity_boost: 0.8,
                  style: 0.3,
                  use_speaker_boost: true,
                  speed: 1.0,
                },
              }),
            },
          );

          if (!r.ok) {
            const errText = await r.text();
            return new Response(
              JSON.stringify({ error: errText || `TTS failed: ${r.status}` }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
          }

          const audio = await r.arrayBuffer();
          return new Response(audio, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
