import { Microphone, Stop } from "@phosphor-icons/react";

import { cn } from "@/shared/lib/cn";
import TextArea from "@/shared/ui/TextArea";

import { useSpeechToText } from "../hooks/useSpeechToText";

const LANGUAGES = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
];

interface VoiceRecorderProps {
  value: string;
  onChange: (value: string) => void;
  lang: string;
  onLangChange: (lang: string) => void;
}

/** Record, see the transcript live, then edit it before the AI reads it. */
export default function VoiceRecorder({ value, onChange, lang, onLangChange }: VoiceRecorderProps) {
  const speech = useSpeechToText(lang);
  const shown = speech.recording ? `${speech.transcript} ${speech.interim}`.trim() : value;
  const clock = `${Math.floor(speech.seconds / 60)}:${String(speech.seconds % 60).padStart(2, "0")}`;

  function toggle() {
    if (speech.recording) {
      speech.stop();
      onChange(`${speech.transcript} ${speech.interim}`.trim());
    } else {
      speech.start();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-line py-6">
        <button
          type="button"
          onClick={toggle}
          aria-label={speech.recording ? "Stop recording" : "Start recording"}
          className={cn(
            "flex size-16 items-center justify-center rounded-full text-white transition-transform active:scale-95",
            speech.recording ? "animate-record bg-red-500" : "bg-accent hover:bg-accent-hover",
          )}
        >
          {speech.recording ? (
            <Stop size={24} weight="fill" />
          ) : (
            <Microphone size={26} weight="fill" />
          )}
        </button>
        <p className="text-xs text-fg-muted">
          {speech.recording ? (
            <span className="font-mono text-[#e5484d]">● Recording {clock}</span>
          ) : value ? (
            "Recording done. Check the transcript below."
          ) : (
            "Tap to record. Say what needs doing, who, and by when."
          )}
        </p>
        <select
          value={lang}
          onChange={(e) => onLangChange(e.target.value)}
          disabled={speech.recording}
          className="h-7 rounded-md border border-line bg-panel px-2 text-xs text-fg-muted"
          aria-label="Language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        {speech.error && <p className="px-6 text-center text-xs text-[#e5484d]">{speech.error}</p>}
      </div>
      <TextArea
        label="Transcript"
        hint="Fix any misheard words before continuing."
        rows={3}
        value={shown}
        readOnly={speech.recording}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          speech.supported
            ? "Your words appear here as you speak…"
            : "Voice isn't supported in this browser. Type here instead."
        }
      />
    </div>
  );
}
