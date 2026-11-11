import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';

import { dateTime, jsonBody, objectId, operation, page } from '../../core/openapi';
import { idParamSchema } from '../../core/validation';
import {
  clientCallIdParamsSchema,
  clientCallUpdateBodySchema,
  createCallSchema,
  listCallsQuerySchema,
} from './call.validation';

const phoneTags = ['Device agent (phone)'];

const call = z.object({
  _id: objectId,
  employee: z
    .object({ _id: objectId, name: z.string(), employeeId: z.string() })
    .nullable()
    .meta({ description: 'Who held the phone; null when unknown (no or several assignments)' }),
  device: z.object({ _id: objectId, model: z.string(), serial: z.string() }),
  number: z.string().meta({ description: 'Masked telephone number' }),
  direction: z.enum(['incoming', 'outgoing', 'missed']),
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
  durationSec: z.number().int(),
  status: z.enum(['completed', 'in_progress', 'failed']),
  recordingStatus: z.enum(['uploaded', 'uploading', 'missing', 'too_short', 'none']),
  flagCount: z.number().int(),
});

const callDetail = call.extend({
  number: z.string().meta({ description: 'Full telephone number (E.164)' }),
  audioUrl: z.string().nullable().meta({
    description:
      'Short-lived playback link; null until the recording is uploaded or when recordings are off',
  }),
  recordingExt: z.string().nullable().meta({
    description: 'Recording file extension (e.g. m4a, amr); null when the call has no file',
    example: 'm4a',
  }),
  transcript: z.string().nullable().meta({ description: 'Always null for now' }),
  flags: z.array(z.unknown()).meta({ description: 'Always empty for now' }),
});

const upload = z.object({
  method: z.literal('PUT'),
  url: z.string().meta({ description: 'Presigned storage URL for the recording' }),
  headers: z.record(z.string(), z.string()).meta({
    description: 'Send exactly these headers with the PUT',
    example: {
      'Content-Type': 'audio/mp4',
      'Content-Length': '482133',
      'x-amz-checksum-sha256': '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    },
  }),
  expiresAt: dateTime,
});

export const callPaths: ZodOpenApiPathsObject = {
  '/api/devices/me/calls': {
    post: operation({
      tags: phoneTags,
      auth: 'device',
      summary: 'Send one call log entry',
      description:
        'One call per request. The server normalises `number` to E.164 and links the call to ' +
        'the employee who held the phone at `startedAt` (left empty when that is unclear).\n\n' +
        '`clientCallId` is generated on the phone and identifies the call: sending the same ' +
        '`clientCallId` again returns the stored call instead of a duplicate, so a retry is ' +
        'safe.\n\n' +
        '`startedAt` must be no more than 5 minutes in the future and no older than 7 days.\n\n' +
        '`recording` is required for incoming calls (400 when null). Send ' +
        '`recording: null` only for missed calls; a file sent with a missed call is ignored.\n\n' +
        'When recordings are enabled, `upload` holds a presigned URL: PUT the file to it with ' +
        'the given headers before `expiresAt`. A resend of the same `clientCallId` gets a fresh ' +
        'URL for the first submitted file. `upload` is null for missed calls, when the file is ' +
        'already uploaded, or when recordings are off.',
      requestBody: jsonBody(
        createCallSchema.meta({
          example: {
            clientCallId: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
            number: '+919876543210',
            direction: 'outgoing',
            callLogType: 2,
            startedAt: '2026-10-08T09:30:00Z',
            durationSec: 125,
            recording: {
              sizeBytes: 482133,
              mimeType: 'audio/mp4',
              sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            },
          },
        }),
      ),
      data: z.object({
        callId: objectId,
        upload: upload
          .nullable()
          .meta({ description: 'Where to upload the recording; null when no upload is needed' }),
      }),
      message: 'Call record created successfully',
    }),
  },
  '/api/devices/me/calls/{clientCallId}/recording/upload-url': {
    post: operation({
      tags: phoneTags,
      auth: 'device',
      summary: 'Get a fresh upload URL for a call recording',
      description:
        'Use when the URL from `POST /api/devices/me/calls` expired before the upload finished. ' +
        'The URL is signed for the file metadata sent with the call (size, type, sha256). ' +
        '404 if this device has no such call; 409 if its recording is already uploaded or the ' +
        'call has no recording metadata; 503 if recordings are off.',
      requestParams: { path: clientCallIdParamsSchema },
      data: z.object({ callId: objectId, upload }),
      message: 'Url issued successfully',
      errors: [404, 409, 503],
    }),
  },
  '/api/devices/me/calls/{clientCallId}/recording/complete': {
    post: operation({
      tags: phoneTags,
      auth: 'device',
      summary: 'Confirm a call recording was uploaded',
      description:
        'Call after the PUT succeeds. The server checks that the file is in storage with the ' +
        'expected size and that `sha256` matches the one sent with the call, then marks the ' +
        'recording uploaded. Calling it again after success returns the same 200.\n\n' +
        '404 if the call is unknown or has no recording; 409 if the checksum or size does not ' +
        'match or the file is not in storage; 503 if recordings are off.',
      requestParams: { path: clientCallIdParamsSchema },
      requestBody: jsonBody(clientCallUpdateBodySchema),
      data: z.object({ recordingStatus: z.literal('uploaded') }),
      message: 'Call status updated successfully',
      errors: [409, 503],
    }),
  },
  '/api/calls': {
    get: operation({
      tags: ['Calls'],
      auth: 'admin',
      summary: 'List calls',
      description:
        'Filter and search calls by date (YYYY-MM-DD in company time), employee, device, ' +
        'direction, status, recording and flagged state. Search matches employee name/code or ' +
        'the phone number. Phone numbers are masked in list results. Defaults to newest first.',
      requestParams: { query: listCallsQuerySchema },
      data: page(call),
      message: 'Calls fetched successfully',
    }),
  },
  '/api/calls/{id}': {
    get: operation({
      tags: ['Calls'],
      auth: 'admin',
      summary: 'Get a call',
      description: 'One call with the full phone number. 404 if the call is unknown or deleted.',
      requestParams: { path: idParamSchema },
      data: callDetail,
      message: 'Call details fetched successfully',
      errors: [404],
    }),
  },
};
