import { model, Schema, type Types } from 'mongoose';

export const CALL_DIRECTIONS = ['incoming', 'outgoing', 'missed'] as const;
export type callDirection = (typeof CALL_DIRECTIONS)[number];
export const CALL_STATUSES = ['completed', 'failed'] as const;
export const CALL_RECORDING_STATUS = [
  'uploaded',
  'uploading',
  'missing',
  'none',
  'too_short',
] as const;
//  'in_progress',
export type callStatus = (typeof CALL_STATUSES)[number];

export interface IRecording {
  expected: boolean;
  status: string;
  // Set only when the phone reported a file (not for missed calls or `recording: null`).
  key?: string;
  sizeBytes?: number;
  mimeType?: string;
  sha256?: string;
  uploadUrlIssuedAt?: Date;
  uploadedAt?: Date;
  // Set by the recording.markMissing job; cleared if the file still arrives later.
  missingAt?: Date;
}

// recoringSchema is embedded in the call document, so it has no _id of its own.
const recordingSchema = new Schema<IRecording>(
  {
    expected: { type: Boolean, required: true },
    status: { type: String, enum: CALL_RECORDING_STATUS, required: true },
    key: { type: String },
    sizeBytes: { type: Number },
    mimeType: { type: String },
    sha256: { type: String },
    uploadUrlIssuedAt: { type: Date },
    uploadedAt: { type: Date },
    missingAt: { type: Date },
  },
  { _id: false },
);

export interface ICall {
  deviceId: Types.ObjectId;
  employeeId: Types.ObjectId | null;
  clientCallId: string;
  number: string | null;
  numberDigits: string | null;
  direction: callDirection;
  callLogType: number;
  startedAt: Date;
  durationSec: number;
  status: callStatus;
  recording: IRecording | null;
  flagCount: number;
  isDeleted: boolean;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const callSchema = new Schema<ICall>(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    clientCallId: { type: String, required: true },
    number: { type: String, default: null },
    numberDigits: {
      type: String,
      default: null,
      match: [/^\d+$/, 'numberDigits must contain digits only'],
    },
    direction: { type: String, enum: CALL_DIRECTIONS },
    callLogType: { type: Number },
    startedAt: { type: Date },
    // 14400 seconds is approx 4 hours
    durationSec: {
      type: Number,
      min: 0,
      max: 14400,
    },
    status: { type: String, enum: CALL_STATUSES, required: true },
    recording: { type: recordingSchema, required: true },
    flagCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    receivedAt: { type: Date },
  },
  { timestamps: true },
);

callSchema.index({ deviceId: 1, clientCallId: 1 }, { unique: true });
callSchema.index({ startedAt: -1 });
callSchema.index({ employeeId: 1, startedAt: -1 });
callSchema.index({ deviceId: 1, startedAt: -1 });
// The recording jobs (call.jobs.ts): links never confirmed, and recordings still waiting.
callSchema.index({
  'recording.uploadedAt': 1,
  'recording.missingAt': 1,
  'recording.uploadUrlIssuedAt': 1,
});
callSchema.index({ 'recording.uploadedAt': 1, 'recording.missingAt': 1, receivedAt: 1 });
// Recordings given up on. Most calls have none, so only those are indexed.
callSchema.index(
  { 'recording.missingAt': 1 },
  { partialFilterExpression: { 'recording.missingAt': { $type: 'date' } } },
);

export const Call = model<ICall>('Call', callSchema);
