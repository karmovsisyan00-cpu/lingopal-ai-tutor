import { useCallback, useEffect, useRef, useState } from "react";
import { bcp47For } from "@/lib/languages";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

export function useVoiceRecognition(language: string) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = bcp47For(language);
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setTranscript(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    return () => { try { r.stop(); } catch { /* noop */ } };
  }, [language]);

  const start = useCallback(() => {
    if (!recogRef.current) return;
    setTranscript("");
    try { recogRef.current.start(); setListening(true); } catch { /* noop */ }
  }, []);
  const stop = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, transcript, supported, start, stop };
}

let currentAudio: HTMLAudioElement | null = null;

function fallbackBrowserSpeak(text: string, language: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp47For(language);
  u.rate = 0.95;
  synth.speak(u);
}

export async function speak(text: string, language: string) {
  if (typeof window === "undefined") return;
  const trimmed = text?.trim();
  if (!trimmed) return;

  // Stop any in-flight playback
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }

  try {
    const { ttsSpeak } = await import("@/lib/tts.functions");
    const result = await ttsSpeak({ data: { text: trimmed, voice: "D4R2GKT3PhtzOVCbiNsg" } });
    const url = `data:${result.mime};base64,${result.audio}`;
    const audio = new Audio(url);
    currentAudio = audio;
    await audio.play();
  } catch {
    fallbackBrowserSpeak(trimmed, language);
  }
}
