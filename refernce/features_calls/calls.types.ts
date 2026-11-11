export type CallDirection = "incoming" | "outgoing" | "missed";
export type CallStatus = "completed" | "in_progress" | "failed";
/** "none" is for calls that have nothing to record, such as missed calls. */
export type RecordingStatus = "uploaded" | "uploading" | "missing" | "none" | "too_short";

/** Snapshot of who had the phone when the call happened. */
export interface CallEmployee {
  _id: string;
  name: string;
  employeeId: string;
}

export interface CallDevice {
  _id: string;
  model: string;
  serial: string;
}

export interface Call {
  _id: string;
  /** null when it isn't known who held the phone (shared phones, or none assigned). */
  employee: CallEmployee | null;
  device: CallDevice;
  /** Full number. Lists must mask it; only the detail view shows it. */
  number: string;
  direction: CallDirection;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  status: CallStatus;
  recordingStatus: RecordingStatus;
  /** Number of flagged moments in the call (0 = not flagged). */
  flagCount: number;
}

/** Placeholder for the transcript feature: speaker-labelled lines with timestamps. */
export interface TranscriptLine {
  atSec: number;
  speaker: string;
  text: string;
  /** True for the line that caused a flag. */
  flagged?: boolean;
}

/** Placeholder for the flags feature: a flagged moment in the call. */
export interface CallFlag {
  atSec: number;
  reason: string;
}

export interface CallDetail extends Call {
  /** Short-lived signed URL; null until the recording is uploaded. */
  audioUrl: string | null;
  /** Recording file extension ("m4a", "amr", ...), used for the download name; null when there is no file. */
  recordingExt: string | null;
  transcript: TranscriptLine[] | null;
  flags: CallFlag[];
}

export interface CallFilters {
  search?: string;
  from?: string;
  to?: string;
  direction?: string;
  employeeId?: string;
  deviceId?: string;
  status?: string;
  /** has | missing */
  recording?: string;
  /** "true" = only flagged calls. */
  flagged?: string;
}
