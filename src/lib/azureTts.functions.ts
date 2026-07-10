import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { speakAzureSpeech } from "@/lib/ttsProviders.server";

const ALLOWED_VOICES = ["hy-AM-AnahitNeural", "hy-AM-HaykNeural"] as const;

export const azureTtsSpeak = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(4000),
      voice: z.enum(ALLOWED_VOICES).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const voice = data.voice ?? "hy-AM-AnahitNeural";
    return speakAzureSpeech(data.text, voice);
  });

