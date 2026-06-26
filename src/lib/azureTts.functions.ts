import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_VOICES = ["hy-AM-AnahitNeural", "hy-AM-HaykNeural"] as const;

export const azureTtsSpeak = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(4000),
      voice: z.enum(ALLOWED_VOICES).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) throw new Error("Azure Speech not configured");

    const voice = data.voice ?? "hy-AM-AnahitNeural";
    const escaped = data.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const ssml =
      `<speak version='1.0' xml:lang='hy-AM'>` +
      `<voice name='${voice}'>${escaped}</voice></speak>`;

    const r = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "lingua-tutor",
        },
        body: ssml,
      },
    );

    if (!r.ok) {
      const err = await r.text();
      console.error("Azure TTS error", r.status, err);
      throw new Error(`Azure TTS failed: ${r.status}`);
    }

    const buf = await r.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { audio: base64, mime: "audio/mpeg" };
  });
