import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchWithRetry } from "@/lib/fetch-retry.server";

type TestResult = {
  provider: "azure" | "elevenlabs";
  ok: boolean;
  status?: number;
  message: string;
  details?: Record<string, string | number | boolean | null>;
  audio?: string;
  mime?: string;
};

async function testAzure(): Promise<TestResult> {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const rawRegion = process.env.AZURE_SPEECH_REGION?.trim();

  const details: Record<string, string | number | boolean | null> = {
    keyPresent: !!key,
    keyLength: key?.length ?? 0,
    regionPresent: !!rawRegion,
    regionValue: rawRegion ?? null,
  };

  if (!key || !rawRegion) {
    return {
      provider: "azure",
      ok: false,
      message: "AZURE_SPEECH_KEY կամ AZURE_SPEECH_REGION բացակայում է։",
      details,
    };
  }

  const region = rawRegion.toLowerCase().replace(/\s+/g, "");
  const regionPattern = /^[a-z]+[a-z0-9-]*$/;
  const regionLooksLikeSecret =
    region.startsWith("sk_") || region.includes(".") || region.length > 40 || /^[a-f0-9]{32,}$/i.test(region);
  if (!regionPattern.test(region) || regionLooksLikeSecret) {
    return {
      provider: "azure",
      ok: false,
      message:
        "AZURE_SPEECH_REGION-ը region ID չէ (օր. 'eastus'): կարծես API բանալի է դրված։",
      details: { ...details, normalizedRegion: region },
    };
  }
  if (key.length < 20 || key.startsWith("sk_")) {
    return {
      provider: "azure",
      ok: false,
      message: "AZURE_SPEECH_KEY-ը իրական Azure Speech key-ի ձև չունի։",
      details,
    };
  }

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml =
    `<speak version='1.0' xml:lang='hy-AM'>` +
    `<voice name='hy-AM-AnahitNeural'>Բարեւ</voice></speak>`;

  try {
    const r = await fetchWithRetry(
      endpoint,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "lingua-tutor-test",
        },
        body: ssml,
      },
      { retries: 1, timeoutMs: 12000 },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return {
        provider: "azure",
        ok: false,
        status: r.status,
        message: `Azure վերադարձրեց HTTP ${r.status}։`,
        details: { ...details, endpoint, body: body.slice(0, 300) },
      };
    }
    const buf = await r.arrayBuffer();
    return {
      provider: "azure",
      ok: true,
      status: r.status,
      message: `Azure TTS աշխատում է (${buf.byteLength} bytes)։`,
      details: { ...details, endpoint, bytes: buf.byteLength },
      audio: Buffer.from(buf).toString("base64"),
      mime: "audio/mpeg",
    };
  } catch (e) {
    return {
      provider: "azure",
      ok: false,
      message: `Ցանցային սխալ: ${(e as Error).message}`,
      details: { ...details, endpoint },
    };
  }
}

async function testElevenLabs(): Promise<TestResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const details: Record<string, string | number | boolean | null> = {
    keyPresent: !!apiKey,
    keyLength: apiKey?.length ?? 0,
  };
  if (!apiKey) {
    return {
      provider: "elevenlabs",
      ok: false,
      message: "ELEVENLABS_API_KEY բացակայում է։",
      details,
    };
  }
  const voiceId = "JBFqnCBsd6RMkjVDRZzb";
  try {
    const r = await fetchWithRetry(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Hello, this is a test.",
          model_id: "eleven_multilingual_v2",
        }),
      },
      { retries: 1, timeoutMs: 12000 },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return {
        provider: "elevenlabs",
        ok: false,
        status: r.status,
        message: `ElevenLabs վերադարձրեց HTTP ${r.status}։`,
        details: { ...details, body: body.slice(0, 300) },
      };
    }
    const buf = await r.arrayBuffer();
    return {
      provider: "elevenlabs",
      ok: true,
      status: r.status,
      message: `ElevenLabs TTS աշխատում է (${buf.byteLength} bytes)։`,
      details: { ...details, bytes: buf.byteLength },
      audio: Buffer.from(buf).toString("base64"),
      mime: "audio/mpeg",
    };
  } catch (e) {
    return {
      provider: "elevenlabs",
      ok: false,
      message: `Ցանցային սխալ: ${(e as Error).message}`,
      details,
    };
  }
}

export const ttsProviderTest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ provider: z.enum(["azure", "elevenlabs"]) }).parse)
  .handler(async ({ data }): Promise<TestResult> => {
    return data.provider === "azure" ? await testAzure() : await testElevenLabs();
  });
