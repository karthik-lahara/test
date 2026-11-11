import { z } from 'zod';

import { pageQuerySchema, sortQuerySchema } from '../../core/pagination';
import { objectIdSchema } from '../../core/validation';
import { CALL_DIRECTIONS, CALL_STATUSES } from './call.model';

export const RECORDING_MAX_BYTES = 100 * 1024 * 1024;
export const RECORDING_MIME_TYPES = [
  'audio/mp4',
  'audio/m4a',
  'audio/3gpp',
  'audio/amr',
  'audio/wav',
] as const;
export const CALL_SORT_FIELDS = ['startedAt', 'durationSec'] as const;
export const NO_CALL_RECORDING_REASONS = ['captured', 'too_short', 'not_applicable'] as const;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;

export const createCallSchema = z
  .object({
    clientCallId: z.uuid(),
    // Any text from the phone's call log (private / unknown callers included). The service
    number: z.string().trim().max(50).nullable(),
    direction: z.enum(CALL_DIRECTIONS),
    callLogType: z.number().int(),
    startedAt: z.coerce
      .date()
      .refine(
        (date) =>
          date.getTime() <= Date.now() + MAX_FUTURE_MS &&
          date.getTime() >= Date.now() - MAX_PAST_MS,
        {
          message:
            'startedAt must be no more than 5 minutes in the future and no older than 7 days',
        },
      ),
    durationSec: z.number().int().min(0).max(14400),
    // z.object strips unknown keys, so the phone can't set the server's recording fields
    // (expected, status, key...). Missed calls are handled in the service: expected = false.
    recording: z
      .object({
        sizeBytes: z.number().int().min(0).max(RECORDING_MAX_BYTES),
        mimeType: z.enum(RECORDING_MIME_TYPES),
        sha256: z.hash('sha256'),
      })
      .nullish(),
    recordingStatus: z.enum(NO_CALL_RECORDING_REASONS).optional(),
  })
  .refine(
    (call) =>
      // If recordingStatus is captured, recording details are mandatory
      (call.recordingStatus !== 'captured' ||
        (call.recording !== null && call.recording !== undefined)) &&
      // Incoming/outgoing must have either recording or recordingStatus
      (call.direction === 'missed' ||
        call.recording !== undefined ||
        call.recordingStatus !== undefined),
    {
      path: ['recording'],
      message:
        'Either recording details or recordingStatus must be provided for incoming/outgoing calls. Recording details are required when recordingStatus is captured.',
    },
  );

export const listCallsQuerySchema = pageQuerySchema
  .extend(sortQuerySchema(CALL_SORT_FIELDS, 'startedAt').shape)
  .extend({
    search: z.string().trim().max(100).optional(),
    from: z.iso.date('Date must be YYYY-MM-DD').optional(),
    to: z.iso.date('Date must be YYYY-MM-DD').optional(),
    direction: z.enum(CALL_DIRECTIONS).optional(),
    employeeId: objectIdSchema.optional(),
    deviceId: objectIdSchema.optional(),
    status: z.enum(CALL_STATUSES).optional(),
    // has = uploaded or uploading; missing = expected but never sent.
    recording: z.enum(['has', 'missing']).optional(),
    flagged: z.stringbool({ truthy: ['true'], falsy: ['false'] }).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from must be on or before to',
    path: ['from'],
  });
export const clientCallIdParamsSchema = z.object({ clientCallId: z.uuid() });
export const clientCallUpdateBodySchema = z.object({ sha256: z.hash('sha256') });

export type CreateCallInput = z.infer<typeof createCallSchema>;
export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;
export type UpdateCallInput = z.infer<typeof clientCallUpdateBodySchema>;
