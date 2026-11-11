import { z } from 'zod';

import { env } from '../../config/env';
import { PermanentJobError } from '../../core/jobs/queue';
import { defineJob, type JobRegistry, type RecurringJob } from '../../core/jobs/worker';
import { getRecordingStorage } from '../../core/storage';
import { objectIdSchema } from '../../core/validation';
import logger from '../../utils/logger';
import { Call } from './call.model';
import { markRecordingUploaded, RECORDING_PROCESS_JOB } from './call.service';

const RECORDING_RECONCILE_JOB = 'recording.reconcile';
const RECORDING_MARK_MISSING_JOB = 'recording.markMissing';

const SWEEP_EVERY_MS = 15 * 60 * 1000;
// A phone gets this long to confirm an upload before the server checks storage itself.
const RECONCILE_AFTER_MS = 30 * 60 * 1000;
const RECONCILE_BATCH = 500;
// Recordings marked missing are still checked this long: a phone can stay offline for days,
// upload the file, and lose the network again before confirming it.
const LATE_UPLOAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const notDeleted = { isDeleted: false };

const requireStorage = () => {
  const storage = getRecordingStorage();
  if (!storage) throw new Error('Call recordings are not enabled');
  return storage;
};

// Saves what storage really holds. Transcription hooks in here later.
export const processRecording = async (callId: string) => {
  const call = await Call.findOne({ _id: callId, ...notDeleted })
    .select('recording')
    .lean();
  const key = call?.recording?.key;
  if (!call || !key) throw new PermanentJobError('Call or recording not found');
  // The job is added just before the call is marked uploaded, so this can run first: try again.
  if (!call.recording?.uploadedAt) throw new Error('Recording is not marked uploaded yet');

  const file = await requireStorage().head(key);
  if (!file) throw new PermanentJobError('Recording not found in storage');

  await Call.updateOne(
    { _id: call._id },
    {
      $set: {
        'recording.sizeBytes': file.sizeBytes,
        ...(file.contentType && { 'recording.mimeType': file.contentType }),
      },
    },
  );
};

// Phones can upload a file and lose the network before confirming it. Calls marked missing
// come last and only for LATE_UPLOAD_WINDOW_MS, so old ones can't fill the batch for ever. One
// file that can't be checked is skipped: it must not stop the others, and the next run tries it.
export const reconcileRecordings = async (now = new Date()) => {
  const storage = getRecordingStorage();
  if (!storage) return;
  const calls = await Call.find({
    ...notDeleted,
    'recording.uploadedAt': null,
    'recording.uploadUrlIssuedAt': { $lte: new Date(now.getTime() - RECONCILE_AFTER_MS) },
    $or: [
      { 'recording.missingAt': null },
      { 'recording.missingAt': { $gte: new Date(now.getTime() - LATE_UPLOAD_WINDOW_MS) } },
    ],
  })
    .sort({ 'recording.missingAt': 1, 'recording.uploadUrlIssuedAt': 1 })
    .limit(RECONCILE_BATCH)
    .select('recording')
    .lean();

  let confirmed = 0;
  let failed = 0;
  let lastError: unknown;
  for (const call of calls) {
    const key = call.recording?.key;
    if (!key) continue;
    try {
      const file = await storage.head(key);
      if (!file || file.sizeBytes !== call.recording?.sizeBytes) continue;
      await markRecordingUploaded(call._id);
      confirmed += 1;
    } catch (err) {
      failed += 1;
      lastError = err;
    }
  }
  if (failed > 0) {
    logger.warn('Some recordings could not be checked', { failed, error: lastError });
  }
  logger.info('Recordings reconciled', { checked: calls.length, confirmed, failed });
};

// With recordings off nothing can be uploaded, so nothing counts as missing.
export const markMissingRecordings = async (now = new Date()) => {
  if (!getRecordingStorage()) return;
  const cutoff = new Date(now.getTime() - env.RECORDING_MISSING_AFTER_HOURS * 60 * 60 * 1000);
  const { modifiedCount } = await Call.updateMany(
    {
      ...notDeleted,
      'recording.expected': true,
      'recording.uploadedAt': null,
      'recording.missingAt': null,
      receivedAt: { $lte: cutoff },
    },
    { $set: { 'recording.missingAt': now } },
  );
  logger.info('Recordings marked missing', { marked: modifiedCount });
};

export const callJobs: JobRegistry = {
  [RECORDING_PROCESS_JOB]: {
    handler: defineJob(z.object({ callId: objectIdSchema }), ({ callId }) =>
      processRecording(callId),
    ),
  },
  [RECORDING_RECONCILE_JOB]: {
    handler: defineJob(z.object({}), () => reconcileRecordings()),
    concurrency: 1,
  },
  [RECORDING_MARK_MISSING_JOB]: {
    handler: defineJob(z.object({}), () => markMissingRecordings()),
    concurrency: 1,
  },
};

export const callRecurringJobs: RecurringJob[] = [
  { type: RECORDING_RECONCILE_JOB, everyMs: SWEEP_EVERY_MS },
  { type: RECORDING_MARK_MISSING_JOB, everyMs: SWEEP_EVERY_MS },
];
