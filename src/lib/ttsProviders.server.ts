import { fetchWithRetry } from "@/lib/fetch-retry.server";

export type SpeechResult = {
  ok: boolean;
  audio?: string;
  mime?: string;
  status?: number;
  error?: string;
};

export type TtsTestResult = {
  provider: "azure" | "elevenlabs";
  ok: boolean;
  status?: number;
  message: string;
  details?: Record<string, string | number | boolean | null>;
  audio?: string;
  mime?: string;
};


const ELEVENLABS_VOICE_MAP: Record<string, string> = {
  Matilda: "XrExE9yKIg1WjnnlVkGX",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Laura: "FGY2WhTYpPnrIDTdsKH5",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
};

const DEFAULT_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

function normalizeAzureRegion(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  try {
    const url = new URL(trimmed);
    const firstHostPart = url.hostname.split(".")[0] ?? "";
    if (firstHostPart) return firstHostPart.replace(/[\s_-]+/g, "");
  } catch {
    // Not a URL; continue with plain region normalization.
  }
  return trimmed.replace(/[\s_-]+/g, "");
}


function resolveAzureConfig():
  | { ok: true; key: string; region: string }
  | { ok: false; error: string; details: Record<string, string | number | boolean | null> } {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const rawRegion = process.env.AZURE_SPEECH_REGION?.trim();
  const baseDetails = {
    keyPresent: !!key,
    keyLength: key?.length ?? 0,
    regionPresent: !!rawRegion,
  };

  if (!key || !rawRegion) {
    return {
      ok: false,
      error:
        "Azure Speech is not configured. Set AZURE_SPEECH_KEY to the Speech resource key and AZURE_SPEECH_REGION to a region ID like eastus.",
      details: baseDetails,
    };
  }

  const normalizedRegion = normalizeAzureRegion(rawRegion);
  return { ok: true, key, region: normalizedRegion };
}

function resolveElevenLabsVoice(voice?: string): string {
  if (!voice) return DEFAULT_ELEVENLABS_VOICE_ID;
  return ELEVENLABS_VOICE_MAP[voice] || (/^[A-Za-z0-9]{20}$/.test(voice) ? voice : DEFAULT_ELEVENLABS_VOICE_ID);
}

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function azureHttpMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Azure Speech rejected the request. Check that AZURE_SPEECH_KEY belongs to the same Speech resource and region.";
  }
  if (status === 400) return "Azure Speech rejected the SSML request or selected voice.";
  return `Azure TTS failed with HTTP ${status}.`;
}

export async function speakAzureSpeech(text: string, voice = "hy-AM-AnahitNeural"): Promise<SpeechResult> {
  const config = resolveAzureConfig();
  if (!config.ok) return { ok: false, error: config.error };

  const endpoint = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = `<speak version='1.0' xml:lang='hy-AM'><voice name='${voice}'>${escapeSsml(text)}</voice></speak>`;

  try {
    const response = await fetchWithRetry(
      endpoint,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": config.key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "lingua-tutor",
        },
        body: ssml,
      },
      { retries: 1, timeoutMs: 12000 },
    );

    if (!response.ok) {
      await response.text().catch(() => "");
      return { ok: false, status: response.status, error: azureHttpMessage(response.status) };
    }

    const buffer = await response.arrayBuffer();
    return { ok: true, audio: toBase64(buffer), mime: "audio/mpeg" };
  } catch {
    return {
      ok: false,
      error: `Could not reach Azure Speech for region '${config.region}'. Check the region ID and network availability.`,
    };
  }
}

export async function speakElevenLabs(text: string, voice?: string): Promise<SpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "ElevenLabs is not configured." };

  const voiceId = resolveElevenLabsVoice(voice);
  try {
    const response = await fetchWithRetry(
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
      { retries: 1, timeoutMs: 12000 },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: body || `ElevenLabs TTS failed with HTTP ${response.status}.`,
      };
    }

    const buffer = await response.arrayBuffer();
    return { ok: true, audio: toBase64(buffer), mime: "audio/mpeg" };
  } catch {
    return { ok: false, error: "Could not reach ElevenLabs TTS." };
  }
}

export async function testAzureSpeech(): Promise<TtsTestResult> {
  const config = resolveAzureConfig();
  if (!config.ok) {
    return { provider: "azure", ok: false, message: config.error, details: config.details };
  }

  const result = await speakAzureSpeech("Բարև", "hy-AM-AnahitNeural");
  if (!result.ok) {
    return {
      provider: "azure",
      ok: false,
      status: result.status,
      message: result.error ?? "Azure TTS test failed.",
      details: { region: config.region, keyPresent: true, keyLength: config.key.length },
    };
  }

  return {
    provider: "azure",
    ok: true,
    status: 200,
    message: `Azure TTS works (${Math.round((result.audio?.length ?? 0) * 0.75)} bytes).`,
    details: { region: config.region, keyPresent: true, keyLength: config.key.length },
    audio: result.audio,
    mime: result.mime,
  };
}

export async function testElevenLabs(): Promise<TtsTestResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "elevenlabs",
      ok: false,
      message: "ELEVENLABS_API_KEY is missing.",
      details: { keyPresent: false, keyLength: 0 },
    };
  }

  const result = await speakElevenLabs("Hello, this is a test.", "George");
  if (!result.ok) {
    return {
      provider: "elevenlabs",
      ok: false,
      status: result.status,
      message: result.error ?? "ElevenLabs TTS test failed.",
      details: { keyPresent: true, keyLength: apiKey.length },
    };
  }

  return {
    provider: "elevenlabs",
    ok: true,
    status: 200,
    message: `ElevenLabs TTS works (${Math.round((result.audio?.length ?? 0) * 0.75)} bytes).`,
    details: { keyPresent: true, keyLength: apiKey.length },
    audio: result.audio,
    mime: result.mime,
  };
}
