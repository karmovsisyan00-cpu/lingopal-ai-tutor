import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const VOICE_MAP: Record<string, string> = {
  George: "JBFqnCBsd6RMkjVDRZzb",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
};

const DEFAULT_VOICE_ID = VOICE_MAP.George;

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
      (data.voice && VOICE_MAP[data.voice]) || DEFAULT_VOICE_ID;

    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
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
    );

    if (!r.ok) {
      const err = await r.text();
      throw new Error(err || `TTS failed: ${r.status}`);
    }

    const buf = await r.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audio: base64, mime: "audio/mpeg" };
  });
