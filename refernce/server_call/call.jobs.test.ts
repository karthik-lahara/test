import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Queue from '../../core/jobs/queue';
import { enqueue, PermanentJobError } from '../../core/jobs/queue';
import { getRecordingStorage } from '../../core/storage';
import { createFakeStorage } from '../../core/storage.fake';
import { markMissingRecordings, processRecording, reconcileRecordings } from './call.jobs';
import type * as CallModel from './call.model';
import { Call } from './call.model';

// CI has no .env, so the real env module would throw on import.
vi.mock('../../config/env', () => ({ env: { RECORDING_MISSING_AFTER_HOURS: 24 } }));
vi.mock('./call.model', async (importOriginal) => ({
  ...(await importOriginal<typeof CallModel>()),
  Call: { find: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('../../core/jobs/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof Queue>()),
  enqueue: vi.fn(),
}));
vi.mock('../../core/storage', () => ({ getRecordingStorage: vi.fn() }));
vi.mock('../device/device.assignment.model', () => ({ DeviceAssignment: {} }));
vi.mock('../device/device.model', () => ({ Device: {} }));
vi.mock('../employee/employee.model', () => ({ Employee: {} }));

const chain = (result: unknown) => {
  const query = {
    select: vi.fn(() => query),
    sort: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn(() => Promise.resolve(result)),
  };
  return query;
};

const now = new Date('2026-10-27T10:00:00Z');
const waiting = (key: string, sizeBytes = 100) => ({
  _id: new Types.ObjectId(),
  recording: { key, sizeBytes, mimeType: 'audio/mp4', uploadUrlIssuedAt: now },
});

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  vi.clearAllMocks();
  storage = createFakeStorage();
  vi.mocked(getRecordingStorage).mockReturnValue(storage);
  vi.mocked(enqueue).mockResolvedValue(true);
});

describe('reconcileRecordings', () => {
  it('marks a file that is in storage but was never confirmed, and adds the process job', async () => {
    const call = waiting('recordings/a.m4a');
    storage.put('recordings/a.m4a', { sizeBytes: 100, contentType: 'audio/mp4' });
    vi.mocked(Call.find).mockReturnValue(chain([call]) as never);

    await reconcileRecordings(now);

    expect(enqueue).toHaveBeenCalledWith(
      'recording.process',
      { callId: String(call._id) },
      { dedupeKey: `recording.process:${String(call._id)}`, maxAttempts: 12 },
    );
    const [filter, update] = vi.mocked(Call.updateOne).mock.calls[0]!;
    expect(filter).toEqual({ _id: call._id, 'recording.uploadedAt': null });
    expect(update).toMatchObject({
      $set: { 'recording.status': 'uploaded' },
      $unset: { 'recording.missingAt': 1 },
    });
  });

  it('ignores a file that is not in storage or has the wrong size', async () => {
    storage.put('recordings/short.m4a', { sizeBytes: 40, contentType: 'audio/mp4' });
    vi.mocked(Call.find).mockReturnValue(
      chain([waiting('recordings/gone.m4a'), waiting('recordings/short.m4a')]) as never,
    );

    await reconcileRecordings(now);

    expect(enqueue).not.toHaveBeenCalled();
    expect(Call.updateOne).not.toHaveBeenCalled();
  });

  it('only looks at links older than 30 minutes, at most 500 per run', async () => {
    const query = chain([]);
    vi.mocked(Call.find).mockReturnValue(query as never);

    await reconcileRecordings(now);

    expect(vi.mocked(Call.find).mock.calls[0]![0]).toEqual({
      isDeleted: false,
      'recording.uploadedAt': null,
      'recording.uploadUrlIssuedAt': { $lte: new Date('2026-10-27T09:30:00Z') },
      $or: [
        { 'recording.missingAt': null },
        { 'recording.missingAt': { $gte: new Date('2026-10-20T10:00:00Z') } },
      ],
    });
    expect(query.sort).toHaveBeenCalledWith({
      'recording.missingAt': 1,
      'recording.uploadUrlIssuedAt': 1,
    });
    expect(query.limit).toHaveBeenCalledWith(500);
  });

  it('does nothing when recordings are off', async () => {
    vi.mocked(getRecordingStorage).mockReturnValue(null);

    await expect(reconcileRecordings(now)).resolves.toBeUndefined();

    expect(Call.find).not.toHaveBeenCalled();
  });
});

describe('markMissingRecordings', () => {
  it('sets missingAt on recordings still waiting after the limit', async () => {
    vi.mocked(Call.updateMany).mockResolvedValue({ modifiedCount: 2 } as never);

    await markMissingRecordings(now);

    expect(vi.mocked(Call.updateMany).mock.calls[0]).toEqual([
      {
        isDeleted: false,
        'recording.expected': true,
        'recording.uploadedAt': null,
        'recording.missingAt': null,
        receivedAt: { $lte: new Date('2026-10-26T10:00:00Z') },
      },
      { $set: { 'recording.missingAt': now } },
    ]);
  });

  it('does nothing when recordings are off', async () => {
    vi.mocked(getRecordingStorage).mockReturnValue(null);

    await markMissingRecordings(now);

    expect(Call.updateMany).not.toHaveBeenCalled();
  });
});

describe('processRecording', () => {
  const uploaded = () => ({
    _id: new Types.ObjectId(),
    recording: { key: 'recordings/a.m4a', uploadedAt: now },
  });

  it('saves the real size and type from storage', async () => {
    const call = uploaded();
    storage.put('recordings/a.m4a', { sizeBytes: 120, contentType: 'audio/m4a' });
    vi.mocked(Call.findOne).mockReturnValue(chain(call) as never);

    await processRecording(String(call._id));

    expect(Call.updateOne).toHaveBeenCalledWith(
      { _id: call._id },
      { $set: { 'recording.sizeBytes': 120, 'recording.mimeType': 'audio/m4a' } },
    );
  });

  it('tries again when the call is not marked uploaded yet', async () => {
    const call = { _id: new Types.ObjectId(), recording: { key: 'recordings/a.m4a' } };
    vi.mocked(Call.findOne).mockReturnValue(chain(call) as never);

    await expect(processRecording(String(call._id))).rejects.toThrow('not marked uploaded yet');
  });

  it('gives up for good when the call or the file is gone', async () => {
    vi.mocked(Call.findOne).mockReturnValue(chain(null) as never);
    await expect(processRecording(String(new Types.ObjectId()))).rejects.toBeInstanceOf(
      PermanentJobError,
    );

    vi.mocked(Call.findOne).mockReturnValue(chain(uploaded()) as never);
    await expect(processRecording(String(new Types.ObjectId()))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });
});
