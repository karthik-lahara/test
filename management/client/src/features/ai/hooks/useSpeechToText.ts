import { useCallback, useEffect, useRef, useState } from "react";

// Browser speech recognition, used to show a live transcript while recording.
// In production the recorded audio goes to the AI service for speech-to-text;
// the browser transcript is the fallback preview and is always editable.

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechToText(lang = "en-IN") {
  const [supported] = useState(() => typeof window !== "undefined" && getRecognition() !== null);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser. Try Chrome or Edge, or type instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) setTranscript((t) => `${t} ${finalText}`.trim());
      setInterim(interimText);
    };
    rec.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in the browser and try again."
          : "Recording stopped. Try again.",
      );
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
      setInterim("");
    };
    recognition.current = rec;
    setError(null);
    setSeconds(0);
    setTranscript("");
    rec.start();
    setRecording(true);
  }, [lang]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setRecording(false);
  }, []);

  useEffect(() => () => recognition.current?.stop(), []);

  return { supported, recording, transcript, setTranscript, interim, error, seconds, start, stop };
}
