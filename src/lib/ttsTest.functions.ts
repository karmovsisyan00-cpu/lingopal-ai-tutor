import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { testAzureSpeech, testElevenLabs, type TtsTestResult } from "@/lib/ttsProviders.server";

export const ttsProviderTest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ provider: z.enum(["azure", "elevenlabs"]) }).parse)
  .handler(async ({ data }): Promise<TtsTestResult> => {
    return data.provider === "azure" ? await testAzureSpeech() : await testElevenLabs();
  });
