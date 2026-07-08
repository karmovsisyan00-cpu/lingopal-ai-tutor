import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchWithRetry } from "@/lib/fetch-retry.server";
import { logError, logWarn, withRequestLog } from "@/lib/logger.server";


const ALLOWED_VOICES = ["hy-AM-AnahitNeural", "hy-AM-HaykNeural"] as const;

export const azureTtsSpeak = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(1).max(4000),
      voice: z.enum(ALLOWED_VOICES).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const key = process.env.AZURE_SPEECH_KEY?.trim();
    const rawRegion = process.env.AZURE_SPEECH_REGION?.trim();
    if (!key || !rawRegion) {
      throw new Error(
        "Azure Speech is not configured. Set AZURE_SPEECH_KEY to your Speech resource key and AZURE_SPEECH_REGION to its region ID, for example 'eastus'.",
      );
    }

    // Normalize: "East US" -> "eastus"; strip whitespace and lowercase.
    const region = rawRegion.toLowerCase().replace(/\s+/g, "");
    const azureRegionPattern = /^[a-z]+[a-z0-9-]*$/;
    const regionLooksLikeSecret =
      region.startsWith("sk_") ||
      region.includes(".") ||
      region.length > 40 ||
      /^[a-f0-9]{32,}$/i.test(region);
    const keyLooksLikeRegion = azureRegionPattern.test(key.toLowerCase()) && key.length <= 32 && !/[0-9]/.test(key);
    const keyLooksLikeAzureSpeechKey = /^[A-Za-z0-9+/=_-]{20,}$/.test(key) && !key.startsWith("sk_");

    if (!azureRegionPattern.test(region) || regionLooksLikeSecret) {
      throw new Error(
        "Invalid AZURE_SPEECH_REGION. It must be the Azure Speech region ID such as 'eastus', 'westeurope', or 'swedencentral' — not an API key.",
      );
    }

    if (!keyLooksLikeAzureSpeechKey || keyLooksLikeRegion) {
      throw new Error(
        "Invalid AZURE_SPEECH_KEY. It must be your Azure Speech resource key, not the region ID or another service token.",
      );
    }

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

    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    return await withRequestLog(
      "azure.tts",
      async (reqId) => {
        let r: Response;
        try {
          r = await fetchWithRetry(
            endpoint,
            {
              method: "POST",
              headers: {
                "Ocp-Apim-Subscription-Key": key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "lingua-tutor",
                "X-Request-Id": reqId,
              },
              body: ssml,
            },
            { retries: 2, timeoutMs: 15000 },
          );
        } catch (e) {
          logError("azure.tts", reqId, e, { endpoint, phase: "network" });
          throw new Error(
            `Azure TTS network error to ${endpoint}. Check AZURE_SPEECH_REGION (e.g. 'eastus').`,
          );
        }

        if (!r.ok) {
          const err = await r.text().catch(() => "");
          logError("azure.tts", reqId, new Error(`HTTP ${r.status}`), {
            endpoint,
            status: r.status,
            body: err.slice(0, 500),
          });
          throw new Error(`Azure TTS failed: ${r.status}`);
        }

        const buf = await r.arrayBuffer();
        const base64 = Buffer.from(buf).toString("base64");
        if (buf.byteLength < 200) {
          logWarn("azure.tts", reqId, { message: "unexpectedly small audio payload", bytes: buf.byteLength });
        }
        return { audio: base64, mime: "audio/mpeg" };
      },
      { voice, region, textLen: data.text.length },
    );
  });

