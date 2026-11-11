import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Job } from '../../core/jobs/job.model';
import { claimNext } from '../../core/jobs/queue';
import { runJob } from '../../core/jobs/worker';
import { getRecordingStorage } from '../../core/storage';
import { createFakeStorage } from '../../core/storage.fake';
import { callJobs, reconcileRecordings } from './call.jobs';
import { Call } from './call.model';
import { markRecordingUploaded, RECORDING_PROCESS_JOB } from './call.service';

// Runs on a real MongoDB: the filters and sort order are what these tests prove.
// CI has no .env, so the real env module would throw on import.
vi.mock('../../config/env', () => ({ env: { RECORDING_MISSING_AFTER_HOURS: 24 } }));
vi.mock('../../core/storage', () => ({ getRecordingStorage: vi.fn() }));

const now = new Date('2026-10-27T10:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const DAY_HOURS = 24;

let mongo: MongoMemoryServer;
let storage: ReturnType<typeof createFakeStorage>;

// Only what the jobs read, plus the two fields of the unique index.
const callDoc = (recording: Record<string, unknown>) => ({
  deviceId: new Types.ObjectId(),
  clientCallId: new Types.ObjectId().toString(),
  isDeleted: false,
  recording,
});

const addCall = async (recording: Record<string, unknown>) => {
  const _id = new Types.ObjectId();
  await Call.collection.insertOne({
    ...callDoc({ expected: true, status: 'uploading', sizeBytes: 100, ...recording }),
    _id,
    receivedAt: hoursAgo(1),
  });
  return _id;
};

const recordingOf = async (id: Types.ObjectId) => {
  const call = await Call.collection.findOne({ _id: id });
  return call?.recording as Record<string, unknown>;
};

const inStorage = (key: string) => storage.put(key, { sizeBytes: 100, contentType: 'audio/mp4' });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Job.init(), Call.init()]);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Job.deleteMany({}), Call.collection.deleteMany({})]);
  storage = createFakeStorage();
  vi.mocked(getRecordingStorage).mockReturnValue(storage);
});

describe('reconcileRecordings', () => {
  it('keeps going when one file cannot be checked', async () => {
    await addCall({ key: 'bad', uploadUrlIssuedAt: hoursAgo(3) });
    const good = await addCall({ key: 'good', uploadUrlIssuedAt: hoursAgo(2) });
    inStorage('good');
    const head = storage.head.bind(storage);
    vi.spyOn(storage, 'head').mockImplementation((key) =>
      key === 'bad' ? Promise.reject(new Error('403')) : head(key),
    );

    await expect(reconcileRecordings(now)).resolves.toBeUndefined();

    expect((await recordingOf(good)).status).toBe('uploaded');
  });

  it('finds a file that arrived after the recording was marked missing, and clears missingAt', async () => {
    const late = await addCall({
      key: 'late',
      uploadUrlIssuedAt: hoursAgo(30),
      missingAt: hoursAgo(5),
    });
    inStorage('late');

    await reconcileRecordings(now);

    const recording = await recordingOf(late);
    expect(recording.status).toBe('uploaded');
    expect(recording.missingAt).toBeUndefined();
  });

  it('stops checking a missing recording after 7 days', async () => {
    const old = await addCall({
      key: 'old',
      uploadUrlIssuedAt: hoursAgo(9 * DAY_HOURS),
      missingAt: hoursAgo(8 * DAY_HOURS),
    });
    inStorage('old');

    await reconcileRecordings(now);

    expect((await recordingOf(old)).status).toBe('uploading');
  });

  it('checks waiting recordings before missing ones, so those cannot fill the batch', async () => {
    const issued = hoursAgo(30);
    await Call.collection.insertMany(
      Array.from({ length: 500 }, (_, index) =>
        callDoc({
          expected: true,
          key: `missing-${index}`,
          sizeBytes: 100,
          uploadUrlIssuedAt: issued,
          missingAt: hoursAgo(5),
        }),
      ),
    );
    const waiting = await addCall({ key: 'waiting', uploadUrlIssuedAt: hoursAgo(1) });
    inStorage('waiting');

    await reconcileRecordings(now);

    expect((await recordingOf(waiting)).status).toBe('uploaded');
  });
});

describe('recording.process', () => {
  it('survives a long storage outage and saves the real size once storage is back', async () => {
    const id = await addCall({ key: 'file', sizeBytes: 999 });
    await markRecordingUploaded(id);
    const handler = callJobs[RECORDING_PROCESS_JOB]?.handler;
    if (!handler) throw new Error('recording.process is not registered');

    const head = vi.spyOn(storage, 'head').mockRejectedValue(new Error('S3 is down'));
    let at = new Date();
    for (let tries = 0; tries < 11; tries += 1) {
      const job = await claimNext([RECORDING_PROCESS_JOB], at);
      if (!job) throw new Error(`no job on try ${tries + 1}`);
      await runJob(handler, job);
      at = new Date(at.getTime() + 2 * 60 * 60 * 1000);
    }
    expect((await Job.findOne().lean())?.status).toBe('queued');

    head.mockResolvedValue({ sizeBytes: 100, contentType: 'audio/m4a' });
    const job = await claimNext([RECORDING_PROCESS_JOB], at);
    if (!job) throw new Error('no job on the last try');
    await runJob(handler, job);

    expect((await Job.findOne().lean())?.status).toBe('done');
    expect(await recordingOf(id)).toMatchObject({ sizeBytes: 100, mimeType: 'audio/m4a' });
  });
});
