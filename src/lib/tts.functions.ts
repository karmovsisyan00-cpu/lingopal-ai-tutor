import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchWithRetry } from "@/lib/fetch-retry.server";
import { logError, withRequestLog } from "@/lib/logger.server";


const VOICE_MAP: Record<string, string> = {
  Matilda: "XrExE9yKIg1WjnnlVkGX",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Charlotte: "XB0fDUnXU5powFXDhCwa",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
};

const DEFAULT_VOICE_ID = "D4R2GKT3PhtzOVCbiNsg";

export const ttsSpeak = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(4000),
      voice: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ElevenLabs not configured");

    const voiceId =
      (data.voice && (VOICE_MAP[data.voice] || (/^[A-Za-z0-9]{20}$/.test(data.voice) ? data.voice : null))) || DEFAULT_VOICE_ID;

    return await withRequestLog(
      "elevenlabs.tts",
      async (reqId) => {
        const r = await fetchWithRetry(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
              "X-Request-Id": reqId,
            },
            body: JSON.stringify({
              text: data.text,
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
          { retries: 2, timeoutMs: 15000 },
        );

        if (!r.ok) {
          const err = await r.text().catch(() => "");
          logError("elevenlabs.tts", reqId, new Error(`HTTP ${r.status}`), {
            status: r.status,
            body: err.slice(0, 500),
          });
          throw new Error(err || `TTS failed: ${r.status}`);
        }

        const buf = await r.arrayBuffer();
        const base64 = Buffer.from(buf).toString("base64");
        return { audio: base64, mime: "audio/mpeg" };
      },
      { voiceId, textLen: data.text.length },
    );
  });

