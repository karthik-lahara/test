import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enqueue } from '../../core/jobs/queue';
import { getRecordingStorage } from '../../core/storage';
import { createFakeStorage } from '../../core/storage.fake';
import { DeviceAssignment } from '../device/device.assignment.model';
import { Device } from '../device/device.model';
import { Employee } from '../employee/employee.model';
import type * as CallModel from './call.model';
import { Call } from './call.model';
import {
  createCall,
  getRecordingStatus,
  issuePresignedUrlWithClientCallId,
  listCalls,
  RECORDING_PROCESS_JOB,
  singleCallDocDetails,
  updateStatusOfCallForAudioUpload,
} from './call.service';
import { createCallSchema, listCallsQuerySchema } from './call.validation';

// CI has no .env, so the real env module would throw on import.
vi.mock('../../config/env', () => ({ env: { RECORDING_MISSING_AFTER_HOURS: 24 } }));
// Keep CALL_DIRECTIONS etc. (call.validation needs them); replace only the model.
vi.mock('./call.model', async (importOriginal) => ({
  ...(await importOriginal<typeof CallModel>()),
  Call: {
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
  },
}));
vi.mock('../device/device.assignment.model', () => ({ DeviceAssignment: { find: vi.fn() } }));
vi.mock('../../core/storage', () => ({ getRecordingStorage: vi.fn() }));
vi.mock('../../core/jobs/queue', () => ({ enqueue: vi.fn() }));
vi.mock('../device/device.model', () => ({ Device: { find: vi.fn(), findById: vi.fn() } }));
vi.mock('../employee/employee.model', () => ({ Employee: { find: vi.fn(), findById: vi.fn() } }));

// A query chain: .select/.sort/.skip/.limit return itself, .lean() resolves to `result`.
const chain = (result: unknown) => {
  const query = {
    select: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn(() => Promise.resolve(result)),
  };
  return query;
};

const deviceId = new Types.ObjectId();
const startedAt = new Date('2026-10-08T09:30:00Z');
const input = (overrides: Record<string, unknown> = {}) => ({
  clientCallId: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  number: '+919876543210',
  direction: 'outgoing' as const,
  callLogType: 2,
  startedAt,
  durationSec: 125,
  recording: null,
  ...overrides,
});

let fakeStorage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  vi.clearAllMocks();
  fakeStorage = createFakeStorage();
  vi.mocked(getRecordingStorage).mockReturnValue(fakeStorage);
  vi.mocked(DeviceAssignment.find).mockReturnValue(chain([]) as never);
  vi.mocked(Employee.find).mockReturnValue(chain([]) as never);
  vi.mocked(Device.find).mockReturnValue(chain([]) as never);
  vi.mocked(Call.find).mockReturnValue(chain([]) as never);
  vi.mocked(Call.countDocuments).mockResolvedValue(0 as never);
});

describe('createCall', () => {
  it('gives one record with the same callId when the same clientCallId is sent twice', async () => {
    const id = new Types.ObjectId();
    vi.mocked(Call.findOneAndUpdate).mockResolvedValue({ _id: id } as never);

    const first = await createCall(deviceId, input());
    const second = await createCall(deviceId, input());

    expect(first).toEqual({ callId: id, upload: null });
    expect(second.callId).toBe(first.callId);
    const [filter, update, options] = vi.mocked(Call.findOneAndUpdate).mock.calls[0]!;
    expect(filter).toEqual({ deviceId, clientCallId: input().clientCallId });
    expect(Object.keys(update as object)).toEqual(['$setOnInsert']); // never overwrites
    expect(options).toMatchObject({ upsert: true });
  });

  it.each([
    ['one open assignment', 1, true],
    ['no assignment', 0, false],
    ['two open assignments (shared phone)', 2, false],
  ])('links the employee for %s', async (_name, count, linked) => {
    const assignments = Array.from({ length: count }, () => ({
      employeeId: new Types.ObjectId(),
    }));
    vi.mocked(DeviceAssignment.find).mockReturnValue(chain(assignments) as never);
    vi.mocked(Call.findOneAndUpdate).mockResolvedValue({ _id: new Types.ObjectId() } as never);

    await createCall(deviceId, input());

    const update = vi.mocked(Call.findOneAndUpdate).mock.calls[0]![1] as {
      $setOnInsert: { employeeId: unknown };
    };
    expect(update.$setOnInsert.employeeId).toBe(linked ? assignments[0]!.employeeId : null);
  });

  it('ignores an employee removed before the call (only assignments open at startedAt)', async () => {
    vi.mocked(Call.findOneAndUpdate).mockResolvedValue({ _id: new Types.ObjectId() } as never);
    await createCall(deviceId, input());
    expect(DeviceAssignment.find).toHaveBeenCalledWith({
      deviceId,
      assignedAt: { $lte: startedAt },
      $or: [{ unassignedAt: null }, { unassignedAt: { $gt: startedAt } }],
    });
  });
});

describe('createCall upload URL', () => {
  const file = { sizeBytes: 1024, mimeType: 'audio/mp4' as const, sha256: 'a'.repeat(64) };
  const savedRecording = () =>
    (
      vi.mocked(Call.findOneAndUpdate).mock.calls[0]![1] as {
        $setOnInsert: { recording: { key?: string; expected: boolean } };
      }
    ).$setOnInsert.recording;

  beforeEach(() => {
    vi.mocked(Call.findOneAndUpdate).mockResolvedValue({ _id: new Types.ObjectId() } as never);
  });

  it('presigns an upload for the saved key when the phone reports a recording', async () => {
    const presignPut = vi.spyOn(fakeStorage, 'presignPut');

    const result = await createCall(deviceId, input({ recording: file }));

    const { key } = savedRecording();
    expect(key).toEqual(expect.any(String));
    expect(presignPut).toHaveBeenCalledWith(key, {
      contentType: file.mimeType,
      contentLength: file.sizeBytes,
      sha256: file.sha256,
    });
    expect(result.upload).toMatchObject({ url: expect.stringContaining('op=put') });
  });

  it('returns no upload when the phone reports no file', async () => {
    const result = await createCall(deviceId, input({ recording: null }));
    expect(result.upload).toBeNull();
  });

  it('returns no upload for a missed call', async () => {
    const result = await createCall(deviceId, input({ direction: 'missed', recording: file }));
    expect(result.upload).toBeNull();
  });

  it('returns no upload when recordings are off (S3 not configured)', async () => {
    vi.mocked(getRecordingStorage).mockReturnValue(null);
    const result = await createCall(deviceId, input({ recording: file }));
    expect(result.upload).toBeNull();
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('saves the file metadata, marks uploadUrlIssuedAt and answers method PUT', async () => {
    const result = await createCall(deviceId, input({ recording: file }));

    expect(savedRecording()).toMatchObject({
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      sha256: file.sha256,
      // Year/month come from the upload time, not a fixed date.
      key: expect.stringMatching(/^recordings\/\d{4}\/\d{2}\/[0-9a-f]{24}\/.+\.m4a$/),
    });
    expect(Call.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ 'recording.uploadedAt': null }),
      { $set: { 'recording.uploadUrlIssuedAt': expect.any(Date) } },
    );
    expect(result.upload).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': '1024' },
      expiresAt: expect.any(Date),
    });
  });

  it('gives a fresh URL for a resent call, signed from the stored metadata', async () => {
    const stored = { expected: true, status: 'uploading', key: 'recordings/first.m4a', ...file };
    vi.mocked(Call.findOneAndUpdate).mockResolvedValue({
      _id: new Types.ObjectId(),
      recording: stored,
    } as never);
    const presignPut = vi.spyOn(fakeStorage, 'presignPut');

    const resent = { ...file, sha256: 'b'.repeat(64) };
    const result = await createCall(deviceId, input({ recording: resent }));

    expect(presignPut).toHaveBeenCalledWith('recordings/first.m4a', {
      contentType: file.mimeType,
      contentLength: file.sizeBytes,
      sha256: file.sha256,
    });
    expect(result.upload).not.toBeNull();
  });

  it('returns no upload when the file is already uploaded', async () => {
    vi.mocked(Call.findOneAndUpdate).mockResolvedValue({
      _id: new Types.ObjectId(),
      recording: { expected: true, status: 'uploaded', key: 'k', ...file, uploadedAt: new Date() },
    } as never);
    const result = await createCall(deviceId, input({ recording: file }));
    expect(result.upload).toBeNull();
    expect(Call.updateOne).not.toHaveBeenCalled();
  });
});

describe('createCallSchema startedAt (validate() answers 400 on failure)', () => {
  // A missed call, so the body is valid without a recording and only startedAt is tested.
  const body = (startedAtMs: number) => ({
    ...input({ direction: 'missed' }),
    startedAt: new Date(startedAtMs).toISOString(),
  });
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;

  it.each([
    ['10 minutes in the future', Date.now() + 10 * MIN],
    ['8 days ago', Date.now() - 8 * DAY],
  ])('rejects %s', (_name, at) => {
    expect(createCallSchema.safeParse(body(at)).success).toBe(false);
  });

  it.each([
    ['4 minutes in the future', Date.now() + 4 * MIN],
    ['6 days ago', Date.now() - 6 * DAY],
  ])('accepts %s', (_name, at) => {
    expect(createCallSchema.safeParse(body(at)).success).toBe(true);
  });
});

describe('listCalls', () => {
  const filterFor = async (query: Record<string, unknown>) => {
    await listCalls(listCallsQuerySchema.parse(query));
    return vi.mocked(Call.find).mock.calls[0]![0];
  };

  it.each([
    [{ direction: 'missed' }, { direction: 'missed' }],
    [{ status: 'failed' }, { status: 'failed' }],
    [{ flagged: 'true' }, { flagCount: { $gt: 0 } }],
    [{ flagged: 'false' }, { flagCount: { $in: [0, null] } }],
  ])('filters %o', async (query, expected) => {
    expect(await filterFor(query)).toMatchObject({ isDeleted: false, ...expected });
  });

  it('filters by employee and device id', async () => {
    const employeeId = new Types.ObjectId().toString();
    const device = new Types.ObjectId().toString();
    expect(await filterFor({ employeeId, deviceId: device })).toMatchObject({
      employeeId,
      deviceId: device,
    });
  });

  it.each(['has', 'missing'])('filters recording=%s by the helper rules', async (recording) => {
    const filter = await filterFor({ recording });
    expect(filter).toHaveProperty('$and');
  });

  it('searches employee name/code first, then $in, plus numberDigits', async () => {
    const employeeId = new Types.ObjectId();
    vi.mocked(Employee.find).mockReturnValueOnce(chain([{ _id: employeeId }]) as never);
    const filter = await filterFor({ search: 'ravi 98765' });
    expect(filter).toMatchObject({
      $or: [{ employeeId: { $in: [employeeId] } }, { numberDigits: /98765/ }],
    });
  });

  it('uses company-time day boundaries (Asia/Kolkata, UTC+5:30)', async () => {
    const filter = await filterFor({ from: '2026-10-08', to: '2026-10-08' });
    expect(filter).toMatchObject({
      startedAt: {
        $gte: new Date('2026-10-07T18:30:00.000Z'),
        $lt: new Date('2026-10-08T18:30:00.000Z'),
      },
    });
  });

  it.each([
    [{}, { startedAt: -1, _id: -1 }],
    [
      { sort: 'durationSec', dir: 'asc' },
      { durationSec: 1, _id: 1 },
    ],
  ])('sorts %o', async (query, expected) => {
    const find = chain([]);
    vi.mocked(Call.find).mockReturnValue(find as never);
    await listCalls(listCallsQuerySchema.parse(query));
    expect(find.sort).toHaveBeenCalledWith(expected);
  });
});

describe('phone number masking', () => {
  const stored = {
    _id: new Types.ObjectId(),
    deviceId,
    employeeId: null,
    number: '+919876543210',
    numberDigits: '9876543210',
    direction: 'outgoing',
    startedAt,
    durationSec: 60,
    status: 'completed',
    recording: { expected: true, status: 'missing' },
    flagCount: 0,
    receivedAt: startedAt,
  };

  it('masks the number in the list', async () => {
    vi.mocked(Call.find).mockReturnValue(chain([stored]) as never);
    vi.mocked(Call.countDocuments).mockResolvedValue(1 as never);
    const page = await listCalls(listCallsQuerySchema.parse({}));
    expect(page.items[0]!.number).toBe('+91 98••••32 10');
  });

  it('shows the full number in the detail', async () => {
    vi.mocked(Call.findOne).mockReturnValue(chain(stored) as never);
    vi.mocked(Device.findById).mockReturnValue(chain(null) as never);
    const detail = await singleCallDocDetails(String(stored._id));
    expect(detail.number).toBe('+919876543210');
    expect(detail).toMatchObject({ audioUrl: null, transcript: null, flags: [] });
  });

  it('answers 404 for an unknown or deleted call', async () => {
    vi.mocked(Call.findOne).mockReturnValue(chain(null) as never);
    await expect(singleCallDocDetails(String(new Types.ObjectId()))).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('issuePresignedUrlWithClientCallId (fresh upload URL)', () => {
  const clientCallId = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
  const pending = {
    _id: new Types.ObjectId(),
    recording: {
      expected: true,
      status: 'uploading',
      key: 'recordings/2026/11/x/call.m4a',
      sizeBytes: 1024,
      mimeType: 'audio/mp4',
      sha256: 'a'.repeat(64),
    },
  };
  const issueFor = (call: unknown) => {
    vi.mocked(Call.findOne).mockReturnValue(chain(call) as never);
    return issuePresignedUrlWithClientCallId(deviceId, clientCallId);
  };

  it('signs a PUT for the stored metadata and marks uploadUrlIssuedAt', async () => {
    const presignPut = vi.spyOn(fakeStorage, 'presignPut');
    const result = await issueFor(pending);
    expect(presignPut).toHaveBeenCalledWith(pending.recording.key, {
      contentType: 'audio/mp4',
      contentLength: 1024,
      sha256: pending.recording.sha256,
    });
    expect(result.upload).toMatchObject({ method: 'PUT', url: expect.any(String) });
    expect(Call.updateOne).toHaveBeenCalledWith(
      { _id: pending._id, 'recording.uploadedAt': null },
      { $set: { 'recording.uploadUrlIssuedAt': expect.any(Date) } },
    );
  });

  it('answers 503 and sets no timestamp when recordings are off (S3 not configured)', async () => {
    vi.mocked(getRecordingStorage).mockReturnValue(null);
    await expect(issueFor(pending)).rejects.toMatchObject({ statusCode: 503 });
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('answers 409 when the call has no recording metadata', async () => {
    await expect(
      issueFor({ ...pending, recording: { expected: true, status: 'missing' } }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('answers 409 and gives no URL once the recording is already uploaded', async () => {
    const presignPut = vi.spyOn(fakeStorage, 'presignPut');
    await expect(
      issueFor({ ...pending, recording: { ...pending.recording, uploadedAt: new Date() } }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(presignPut).not.toHaveBeenCalled();
    expect(Call.updateOne).not.toHaveBeenCalled();
  });
});

// Call.findOne only finds the call when the query carries the owner's deviceId, like the
// real { deviceId, clientCallId } lookup. Another phone sending the same clientCallId misses.
describe("another device's clientCallId", () => {
  const clientCallId = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
  const otherDeviceId = new Types.ObjectId();
  const owned = {
    _id: new Types.ObjectId(),
    deviceId,
    clientCallId,
    recording: {
      expected: true,
      status: 'uploading',
      key: 'recordings/2026/11/x/call.m4a',
      sizeBytes: 1024,
      mimeType: 'audio/mp4',
      sha256: 'a'.repeat(64),
    },
  };

  beforeEach(() => {
    vi.mocked(Call.findOne).mockImplementation(((filter: {
      deviceId?: Types.ObjectId;
      clientCallId?: string;
    }) =>
      chain(
        filter.clientCallId === clientCallId && filter.deviceId?.equals(deviceId) ? owned : null,
      )) as never);
  });

  it('gets 404 from upload-url and no URL is signed', async () => {
    const presignPut = vi.spyOn(fakeStorage, 'presignPut');
    await expect(
      issuePresignedUrlWithClientCallId(otherDeviceId, clientCallId),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(presignPut).not.toHaveBeenCalled();
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('gets 404 from complete and nothing is marked uploaded', async () => {
    fakeStorage.put(owned.recording.key, { sizeBytes: 1024, contentType: 'audio/mp4' });
    await expect(
      updateStatusOfCallForAudioUpload(otherDeviceId, clientCallId, {
        sha256: owned.recording.sha256,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('still works for the owning device', async () => {
    await expect(issuePresignedUrlWithClientCallId(deviceId, clientCallId)).resolves.toMatchObject({
      upload: { method: 'PUT' },
    });
  });
});

describe('updateStatusOfCallForAudioUpload (complete)', () => {
  const clientCallId = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
  const sha256 = 'a'.repeat(64);
  const pending = {
    _id: new Types.ObjectId(),
    recording: {
      expected: true,
      status: 'uploading',
      key: 'recordings/2026/11/x/call.m4a',
      sizeBytes: 1024,
      mimeType: 'audio/mp4',
      sha256,
    },
  };
  const completeFor = (call: unknown, body = { sha256 }) => {
    vi.mocked(Call.findOne).mockReturnValue(chain(call) as never);
    return updateStatusOfCallForAudioUpload(deviceId, clientCallId, body);
  };

  it('answers 409 when the file is not in storage', async () => {
    await expect(completeFor(pending)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Recording not found in storage',
    });
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('answers 409 when the stored file has the wrong size', async () => {
    fakeStorage.put(pending.recording.key, { sizeBytes: 999, contentType: 'audio/mp4' });
    await expect(completeFor(pending)).rejects.toMatchObject({ statusCode: 409 });
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('answers 409 when the stored file has the wrong content type', async () => {
    fakeStorage.put(pending.recording.key, { sizeBytes: 1024, contentType: 'audio/wav' });
    await expect(completeFor(pending)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Recording content type does not match',
    });
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('marks the recording uploaded when the file is there with the right size', async () => {
    fakeStorage.put(pending.recording.key, { sizeBytes: 1024, contentType: 'audio/mp4' });
    await expect(completeFor(pending)).resolves.toEqual({ recordingStatus: 'uploaded' });
    expect(enqueue).toHaveBeenCalledWith(
      RECORDING_PROCESS_JOB,
      { callId: String(pending._id) },
      expect.objectContaining({ dedupeKey: `${RECORDING_PROCESS_JOB}:${String(pending._id)}` }),
    );
    expect(Call.updateOne).toHaveBeenCalledWith(
      { _id: pending._id, 'recording.uploadedAt': null },
      {
        $set: { 'recording.uploadedAt': expect.any(Date), 'recording.status': 'uploaded' },
        $unset: { 'recording.missingAt': 1 },
      },
    );
  });

  it('answers the same 200 when called again after success, without touching storage', async () => {
    const head = vi.spyOn(fakeStorage, 'head');
    const done = { ...pending, recording: { ...pending.recording, uploadedAt: new Date() } };
    await expect(completeFor(done)).resolves.toEqual({ recordingStatus: 'uploaded' });
    expect(head).not.toHaveBeenCalled();
    expect(Call.updateOne).not.toHaveBeenCalled();
  });
});

describe('call detail audioUrl', () => {
  const key = 'recordings/abc.m4a';
  const stored = (recording: Record<string, unknown>) => ({
    _id: new Types.ObjectId(),
    deviceId,
    employeeId: null,
    number: '+919876543210',
    numberDigits: '9876543210',
    direction: 'outgoing',
    startedAt,
    durationSec: 60,
    status: 'completed',
    recording,
    flagCount: 0,
    receivedAt: new Date(),
  });
  const uploaded = {
    expected: true,
    status: 'uploaded',
    key,
    sizeBytes: 1024,
    uploadedAt: startedAt,
  };

  const detailFor = (call: ReturnType<typeof stored>) => {
    vi.mocked(Call.findOne).mockReturnValue(chain(call) as never);
    vi.mocked(Device.findById).mockReturnValue(chain(null) as never);
    return singleCallDocDetails(String(call._id));
  };

  it('gives a playback URL for an uploaded recording', async () => {
    const presignGet = vi.spyOn(fakeStorage, 'presignGet');
    const detail = await detailFor(stored(uploaded));
    expect(presignGet).toHaveBeenCalledWith(
      key,
      expect.objectContaining({ downloadName: expect.any(String) }),
    );
    expect(detail.audioUrl).toContain('op=get');
  });

  it('gives no playback URL while the file is still uploading', async () => {
    const detail = await detailFor(
      stored({ expected: true, status: 'uploading', key, sizeBytes: 1024 }),
    );
    expect(detail.audioUrl).toBeNull();
  });

  it('gives no playback URL when recordings are off (S3 not configured)', async () => {
    vi.mocked(getRecordingStorage).mockReturnValue(null);
    const detail = await detailFor(stored(uploaded));
    expect(detail.audioUrl).toBeNull();
  });
});

describe('getRecordingStatus', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const file = { expected: true, sizeBytes: 1000 };

  it.each([
    ['missed', 'missed', { expected: false }, 1, 'none'],
    ['uploaded', 'outgoing', { ...file, uploadedAt: now }, 1, 'uploaded'],
    ['no file reported', 'outgoing', { expected: true }, 1, 'missing'],
    ['older than 24 h', 'outgoing', file, 25, 'missing'],
    ['on its way', 'outgoing', file, 1, 'uploading'],
    [
      'unexpected file still shown',
      'incoming',
      { expected: false, sizeBytes: 1000 },
      1,
      'uploading',
    ],
    ['not expected, no file', 'incoming', { expected: false }, 1, 'none'],
    ['too short', 'incoming', { expected: false, status: 'too_short' }, 1, 'too_short'],
  ])('%s', (_name, direction, recording, age, expected) => {
    const call = { direction, recording, receivedAt: hoursAgo(age) } as never;
    expect(getRecordingStatus(call, now)).toBe(expected);
  });
});
