import { type QueryFilter, type Types } from 'mongoose';

import { env } from '../../config/env';
import { maskCallerNumber, parseCallerNumber } from '../../core/callerNumber';
import { AppError } from '../../core/errors';
import { enqueue } from '../../core/jobs/queue';
import { containsPattern, escapeRegExp, skipFor, toPage } from '../../core/pagination';
import { getRecordingStorage } from '../../core/storage';
import { COMPANY_TIME_ZONE, companyDay, formatCompanyDay } from '../../core/time';
import { DeviceAssignment } from '../device/device.assignment.model';
import { Device } from '../device/device.model';
import { Employee } from '../employee/employee.model';
import { Call, type ICall, type IRecording } from './call.model';
import type { CreateCallInput, ListCallsQuery, UpdateCallInput } from './call.validation';

const EXT_BY_MIME = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/3gpp': '3gp',
  'audio/amr': 'amr',
  'audio/amr-wb': 'awb',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'webm',
} as const;
export type RecordingMimeType = keyof typeof EXT_BY_MIME;

export const RECORDING_PROCESS_JOB = 'recording.process';
// About 6 hours of tries (the wait stops growing at 1 hour), so a storage outage doesn't kill
// the job: its dedupeKey means it can't be added again once it is dead.
const RECORDING_PROCESS_MAX_ATTEMPTS = 12;

// for employee
const notDeleted = { isDeleted: false };
// for call
const notDeletedCall = { isDeleted: false };

const buildRecordingObjectKey = (object: {
  deviceId: string;
  callId: string;
  mimeType: RecordingMimeType;
  date: Date;
}) => {
  const year = object.date.getUTCFullYear();
  const month = String(object.date.getUTCMonth() + 1).padStart(2, '0');
  return `recordings/${year}/${month}/${object.deviceId}/${object.callId}.${EXT_BY_MIME[object.mimeType]}`;
};

export type RecordingStatus = 'uploaded' | 'uploading' | 'missing' | 'too_short' | 'none';

// One place for the read-side rules. A reported file is always shown, even when the phone
// said no recording was expected (e.g. incoming + not_applicable but a file still came).
export const getRecordingStatus = (
  call: Pick<ICall, 'direction' | 'recording' | 'receivedAt'>,
  now = new Date(),
): RecordingStatus => {
  const recording = call.recording;
  if (call.direction === 'missed' || !recording) return 'none';
  if (recording.uploadedAt) return 'uploaded';
  // sizeBytes set = the phone reported a file.
  const hasFile = recording.sizeBytes !== undefined && recording.sizeBytes !== null;
  if (!hasFile) {
    if (recording.expected) return 'missing';
    return recording.status === 'too_short' ? 'too_short' : 'none';
  }
  const recordingAfterHoursInMS = env.RECORDING_MISSING_AFTER_HOURS * 60 * 60 * 1000;
  const tooOld = now.getTime() - call.receivedAt.getTime() > recordingAfterHoursInMS;
  return tooOld ? 'missing' : 'uploading';
};

// Write-side rules: what to store for a new call, from direction, the phone's reason and the file.
//   missed                                  → expected false, status none (any file is ignored)
//   file reported (any reason)              → file accepted, status uploading;
//                                             expected true only when the reason is captured
//   no file + not_applicable                → expected false, status none
//                                             (incoming rejected, outgoing not answered)
//   no file + too_short (phone sends it for calls under 5 s) → expected false, status too_short
//   no file + captured/no reason            → expected true,  status missing
const buildRecording = (deviceId: Types.ObjectId, callData: CreateCallInput): IRecording => {
  if (callData.direction === 'missed') return { expected: false, status: 'none' };

  const reason = callData.recordingStatus;
  const file = callData.recording;
  if (file) {
    return {
      ...file,
      expected: reason === undefined || reason === 'captured',
      status: 'uploading',
      key: buildRecordingObjectKey({
        deviceId: String(deviceId),
        callId: callData.clientCallId,
        mimeType: file.mimeType,
        date: new Date(),
      }),
    };
  }

  if (reason === 'not_applicable') return { expected: false, status: 'none' };
  if (reason === 'too_short') return { expected: false, status: 'too_short' };
  return { expected: true, status: 'missing' };
};

export const createCall = async (deviceId: Types.ObjectId, callData: CreateCallInput) => {
  // 1. Normalize to E.164; extract digits for masked display fallback
  let number: string | null = null;
  let numberDigits: string | null = null;
  if (callData.number) {
    const result = parseCallerNumber(callData.number);
    number = result.number;
    numberDigits = result.numberDigits;
  }

  // 2. Find the employee who held this device at call time
  const assignments = await DeviceAssignment.find({
    //  Only this phone's history.
    deviceId,
    // The employee got the phone at or before the call started.
    assignedAt: { $lte: callData.startedAt },
    //  The employee still has it (null) or gave it back after the call started.                                            │ call started.
    $or: [{ unassignedAt: null }, { unassignedAt: { $gt: callData.startedAt } }],
  }).lean();
  const employeeId = assignments.length === 1 ? (assignments[0]?.employeeId ?? null) : null;

  // 3. Recording state (rules in buildRecording). The object key is built by the server:
  // recordings/<yyyy>/<mm>/<deviceId>/<callId>.<ext>, ext from the MIME type.
  const recording = buildRecording(deviceId, callData);

  // 4. Upsert(update + insert) on (deviceId, clientCallId) — duplicate submissions return the same record
  const newCall = await Call.findOneAndUpdate(
    { deviceId, clientCallId: callData.clientCallId },
    {
      $setOnInsert: {
        deviceId,
        employeeId,
        clientCallId: callData.clientCallId,
        number,
        numberDigits,
        direction: callData.direction,
        callLogType: callData.callLogType,
        startedAt: callData.startedAt,
        durationSec: callData.durationSec,
        status: 'completed',
        recording,
        receivedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!newCall) throw new AppError(500, 'Failed to save call');

  // 5. Upload URL: only for a stored file that isn't uploaded yet, and only when recordings
  // are on. Signed from the saved metadata (the first submission wins), so a resent call
  // gets a fresh URL for the same key, sizeBytes and sha256.
  const saved = newCall.recording ?? recording;
  const storage = getRecordingStorage();

  if (
    !storage ||
    !saved.key ||
    !saved.mimeType ||
    saved.sizeBytes === undefined ||
    !saved.sha256 ||
    saved.uploadedAt
  ) {
    return { callId: newCall._id, upload: null };
  }

  const signed = await storage.presignPut(saved.key, {
    contentType: saved.mimeType,
    contentLength: saved.sizeBytes,
    sha256: saved.sha256,
  });
  // Only after signing worked; the uploadedAt filter skips a call whose file arrived meanwhile.
  await Call.updateOne(
    { _id: newCall._id, 'recording.uploadedAt': null },
    { $set: { 'recording.uploadUrlIssuedAt': new Date() } },
  );
  return { callId: newCall._id, upload: { method: 'PUT' as const, ...signed } };
};

export const listCalls = async (query: ListCallsQuery) => {
  const {
    search,
    from,
    to,
    direction,
    employeeId,
    deviceId,
    status,
    recording,
    flagged,
    sort,
    dir,
  } = query;

  const filter: QueryFilter<ICall> = { ...notDeleted };
  if (direction) filter.direction = direction;
  if (employeeId) filter.employeeId = employeeId;
  if (deviceId) filter.deviceId = deviceId;
  if (status) filter.status = status;
  // 'uploading' counts as has: the phone sent recording metadata and the file is on its way.
  // if (recording === 'has') filter['recording.status'] = { $in: ['uploaded', 'uploading'] };
  // if (recording === 'missing') filter['recording.status'] = 'missing';
  const missingCutoff = new Date(Date.now() - env.RECORDING_MISSING_AFTER_HOURS * 60 * 60 * 1000);
  // Mirrors getRecordingStatus: a reported file counts whether or not it was expected.
  const notMissed: QueryFilter<ICall> = { direction: { $ne: 'missed' } };
  if (recording === 'has') {
    filter.$and = [
      notMissed,
      {
        $or: [
          { 'recording.uploadedAt': { $ne: null } },
          { 'recording.sizeBytes': { $ne: null }, receivedAt: { $gte: missingCutoff } },
        ],
      },
    ];
  }
  if (recording === 'missing') {
    filter.$and = [
      notMissed,
      { 'recording.uploadedAt': null },
      {
        $or: [
          { 'recording.expected': true, 'recording.sizeBytes': null },
          { 'recording.sizeBytes': { $ne: null }, receivedAt: { $lt: missingCutoff } },
        ],
      },
    ];
  }
  if (flagged) filter.flagCount = { $gt: 0 };
  if (flagged === false) filter.flagCount = { $in: [0, null] };
  if (search) {
    const pattern = containsPattern(search);
    const employees = await Employee.find({
      ...notDeleted,
      $or: [{ name: pattern }, { employeeId: pattern }],
    })
      .select('_id')
      .limit(500)
      .lean();
    const orData: Record<string, unknown>[] = [
      { employeeId: { $in: employees.map((employee) => employee._id) } },
    ];
    const digits = search.replace(/\D/g, '');
    if (digits) orData.push({ numberDigits: new RegExp(escapeRegExp(digits)) });
    filter.$or = orData;
  }

  if (from || to) {
    filter.startedAt = {
      ...(from && { $gte: companyDay(from).start }),
      ...(to && { $lt: companyDay(to).end }),
    };
  }

  const sortDirection = dir === 'asc' ? 1 : -1;

  const [calls, total] = await Promise.all([
    Call.find(filter)
      .sort({ [sort]: sortDirection, _id: sortDirection })
      .skip(skipFor(query))
      .limit(query.limit)
      .lean(),
    Call.countDocuments(filter),
  ]);

  // One query each for the employees and devices on this page, not one per row.
  const [employees, devices] = await Promise.all([
    Employee.find({ _id: { $in: calls.map((call) => call.employeeId).filter(Boolean) } })
      .select('name employeeId')
      .lean(),
    Device.find({ _id: { $in: calls.map((call) => call.deviceId) } })
      .select('model deviceId')
      .lean(),
  ]);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const deviceById = new Map(devices.map((device) => [String(device._id), device]));

  const items = calls.map((call) => {
    const employee = call.employeeId ? employeeById.get(String(call.employeeId)) : undefined;
    const device = deviceById.get(String(call.deviceId));
    return {
      _id: String(call._id),
      // null when no one, or more than one person, held the phone at the time (shared phones).
      employee: employee
        ? { _id: String(employee._id), name: employee.name, employeeId: employee.employeeId }
        : null,
      // Every call has a device; the lookup includes soft-deleted ones.
      device: {
        _id: String(call.deviceId),
        model: device?.model ?? '',
        serial: device?.deviceId ?? '',
      },
      number: maskCallerNumber(call.number, call.numberDigits),
      direction: call.direction,
      startedAt: call.startedAt,
      endedAt: new Date(call.startedAt.getTime() + call.durationSec * 1000),
      durationSec: call.durationSec,
      status: call.status,
      recordingStatus: getRecordingStatus(call),
      flagCount: call.flagCount ?? 0,
    };
  });

  return toPage(items, total, query);
};

export const singleCallDocDetails = async (id: string) => {
  const callDetails = await Call.findOne({ _id: id, ...notDeletedCall }).lean();
  if (!callDetails) throw new AppError(404, 'Call not found');
  const [employee, device] = await Promise.all([
    callDetails.employeeId
      ? Employee.findById(callDetails.employeeId).select('name employeeId').lean()
      : null,
    Device.findById(callDetails.deviceId).select('model deviceId').lean(),
  ]);

  // Playback URL only once the file is confirmed in storage and recordings are enabled.
  const storage = getRecordingStorage();
  const recording = callDetails.recording;
  // From the key the server built (ext comes from the MIME type); null when there is no file.
  const recordingExt = recording?.key?.split('.').pop() ?? null;
  let audioUrl: string | null = null;
  if (storage && recording?.key && recording.uploadedAt) {
    const day = new Date(callDetails.startedAt).toISOString().slice(0, 10);
    audioUrl = await storage.presignGet(recording.key, {
      downloadName: `call-${employee?.employeeId ?? 'unknown'}-${day}.${recordingExt ?? 'm4a'}`,
    });
  }

  return {
    _id: String(callDetails._id),
    employee: employee
      ? {
          _id: String(employee._id),
          name: employee.name,
          employeeId: employee.employeeId,
        }
      : null,
    device: {
      _id: String(callDetails.deviceId),
      model: device?.model ?? '',
      serial: device?.deviceId ?? '',
    },
    number: callDetails.number ?? callDetails.numberDigits ?? '',
    direction: callDetails.direction,
    startedAt: callDetails.startedAt,
    endedAt: new Date(callDetails.startedAt.getTime() + callDetails.durationSec * 1000),
    durationSec: callDetails.durationSec,
    status: callDetails.status,
    recordingStatus: getRecordingStatus(callDetails),
    recordingExt,
    flagCount: callDetails.flagCount ?? 0,
    audioUrl,
    transcript: null,
    flags: [],
  };
};

export const issuePresignedUrlWithClientCallId = async (
  deviceId: Types.ObjectId,
  clientCallId: string,
) => {
  const call = await Call.findOne({ deviceId, clientCallId, ...notDeletedCall }).lean();
  if (!call) throw new AppError(404, 'Call not found');
  const recording = call.recording;
  if (recording?.uploadedAt) throw new AppError(409, 'Call recording already uploaded');
  if (
    !recording?.key ||
    !recording.mimeType ||
    recording.sizeBytes === undefined ||
    recording.sizeBytes === null ||
    !recording.sha256
  ) {
    throw new AppError(409, 'Call has no recording metadata');
  }
  // Same answer as /complete when S3 isn't configured, instead of a PUT with no URL.
  const storage = getRecordingStorage();
  if (!storage) throw new AppError(503, 'Call recordings are not enabled');

  // Signed from the stored metadata, so the file must match what the phone sent with the call.
  const signed = await storage.presignPut(recording.key, {
    contentType: recording.mimeType,
    contentLength: recording.sizeBytes,
    sha256: recording.sha256,
  });
  // Only after signing worked, like createCall; the uploadedAt filter skips a file that
  // arrived meanwhile.
  await Call.updateOne(
    { _id: call._id, 'recording.uploadedAt': null },
    { $set: { 'recording.uploadUrlIssuedAt': new Date() } },
  );
  return { callId: call._id, upload: { method: 'PUT' as const, ...signed } };
};

// The file is confirmed in storage, by the phone or by the reconcile job. The job is added
// first: if the update then fails, a retry repeats both, and the dedupeKey keeps it one job.
export const markRecordingUploaded = async (callId: Types.ObjectId) => {
  await enqueue(
    RECORDING_PROCESS_JOB,
    { callId: String(callId) },
    {
      dedupeKey: `${RECORDING_PROCESS_JOB}:${String(callId)}`,
      maxAttempts: RECORDING_PROCESS_MAX_ATTEMPTS,
    },
  );
  await Call.updateOne(
    { _id: callId, 'recording.uploadedAt': null },
    {
      $set: { 'recording.uploadedAt': new Date(), 'recording.status': 'uploaded' },
      $unset: { 'recording.missingAt': 1 },
    },
  );
};

export const updateStatusOfCallForAudioUpload = async (
  deviceId: Types.ObjectId,
  clientCallId: string,
  { sha256 }: UpdateCallInput,
) => {
  const call = await Call.findOne({ deviceId, clientCallId, ...notDeletedCall }).lean();
  if (!call) throw new AppError(404, 'Call not found');
  const recording = call.recording;
  if (recording?.uploadedAt) return { recordingStatus: 'uploaded' as const };
  // Any reported file can be completed, even one the phone said wasn't expected.
  if (!recording?.key || recording.sizeBytes === undefined) {
    throw new AppError(409, 'This call has no recording');
  }
  if (recording.sha256 !== sha256) throw new AppError(409, 'Recording checksum does not match');
  const storage = getRecordingStorage();
  if (!storage) throw new AppError(503, 'Call recordings are not enabled');

  // Missing file, size mismatch, or content-type mismatch: 409.
  // Otherwise set uploadedAt and return { recordingStatus: "uploaded" }.
  const result = await storage?.head(recording?.key);
  if (!result) throw new AppError(409, 'Recording not found in storage');
  if (result.sizeBytes !== recording.sizeBytes)
    throw new AppError(409, 'Recording size does not match');
  if (result.contentType !== recording.mimeType)
    throw new AppError(409, 'Recording content type does not match');

  await markRecordingUploaded(call._id);
  return { recordingStatus: 'uploaded' as const };
};

// The call figures the employees list, the employee page and the dashboard show. "This week"
// is the last 7 days up to now, the same window as client/src/mocks/db.ts.
export const CALL_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Calls per employee since `since`, for a page of employees: one aggregation for the whole
// page. Employees with no calls are missing from the map (read them as 0).
export const countCallsByEmployee = async (
  employeeIds: Types.ObjectId[],
  since: Date,
): Promise<Map<string, number>> => {
  if (employeeIds.length === 0) return new Map();
  const rows = await Call.aggregate<{ _id: Types.ObjectId; calls: number }>([
    { $match: { ...notDeleted, employeeId: { $in: employeeIds }, startedAt: { $gte: since } } },
    { $group: { _id: '$employeeId', calls: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.calls]));
};

// One employee's calls since `since` (`EmployeeCallSummary` in employees.types.ts).
export const getCallSummary = async (employeeId: Types.ObjectId, since: Date) => {
  const [summary] = await Call.aggregate<{
    calls: number;
    totalDurationSec: number;
    missed: number;
    flagged: number;
  }>([
    { $match: { ...notDeleted, employeeId, startedAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        calls: { $sum: 1 },
        totalDurationSec: { $sum: '$durationSec' },
        missed: { $sum: { $cond: [{ $eq: ['$direction', 'missed'] }, 1, 0] } },
        flagged: { $sum: { $cond: [{ $gt: ['$flagCount', 0] }, 1, 0] } },
      },
    },
    { $project: { _id: 0 } },
  ]);
  return summary ?? { calls: 0, totalDurationSec: 0, missed: 0, flagged: 0 };
};

// Calls today and yesterday in company days, plus flagged calls in the last 7 days.
// "Yesterday" covers the same stretch of the day as today so far (00:00 to the current
// time), so the dashboard's change against yesterday is fair early in the day; the mock
// works the same way.
export const getCallCounts = async (now = new Date()) => {
  const today = companyDay(formatCompanyDay(now));
  const yesterday = companyDay(formatCompanyDay(today.start.getTime() - 1));
  const yesterdayUntil = new Date(
    yesterday.start.getTime() + (now.getTime() - today.start.getTime()),
  );
  const between = (start: Date, end: Date) =>
    Call.countDocuments({ ...notDeleted, startedAt: { $gte: start, $lt: end } });

  const [callsToday, callsYesterday, flaggedCalls] = await Promise.all([
    between(today.start, today.end),
    between(yesterday.start, yesterdayUntil),
    Call.countDocuments({
      ...notDeleted,
      flagCount: { $gt: 0 },
      startedAt: { $gte: new Date(now.getTime() - CALL_WEEK_MS) },
    }),
  ]);
  return { callsToday, callsYesterday, flaggedCalls };
};

// Calls per company day for the last `days` days, oldest first; days without calls are 0.
// The three columns add up to everything that day, the same calls as `callsToday`.
export const countCallsPerDay = async (days: number, now = new Date()) => {
  const dates = Array.from({ length: days }, (_, index) =>
    formatCompanyDay(now.getTime() - (days - 1 - index) * DAY_MS),
  );
  const rows = await Call.aggregate<{
    _id: string;
    incoming: number;
    outgoing: number;
    missed: number;
  }>([
    { $match: { ...notDeleted, startedAt: { $gte: companyDay(dates[0]).start } } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: COMPANY_TIME_ZONE },
        },
        incoming: { $sum: { $cond: [{ $eq: ['$direction', 'incoming'] }, 1, 0] } },
        outgoing: { $sum: { $cond: [{ $eq: ['$direction', 'outgoing'] }, 1, 0] } },
        missed: { $sum: { $cond: [{ $eq: ['$direction', 'missed'] }, 1, 0] } },
      },
    },
  ]);
  const byDate = new Map(rows.map((row) => [row._id, row]));
  return dates.map((date) => ({
    date,
    incoming: byDate.get(date)?.incoming ?? 0,
    outgoing: byDate.get(date)?.outgoing ?? 0,
    missed: byDate.get(date)?.missed ?? 0,
  }));
};
