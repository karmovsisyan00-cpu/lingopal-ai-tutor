import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { speakElevenLabs } from "@/lib/ttsProviders.server";

export const ttsSpeak = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(4000),
      voice: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    return speakElevenLabs(data.text, data.voice);
  });

