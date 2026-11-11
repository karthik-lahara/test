import { type Request, type Response } from 'express';

import { AppError } from '../../core/errors';
import { sendOk } from '../../core/response';
import { type DeviceRequest } from '../device/device.auth';
import {
  createCall,
  issuePresignedUrlWithClientCallId,
  listCalls,
  singleCallDocDetails,
  updateStatusOfCallForAudioUpload,
} from './call.service';
import { listCallsQuerySchema } from './call.validation';

type IdParams = Request<{ id: string }>;
type ClientCallIdParams = DeviceRequest & Request<{ clientCallId: string }>;

export const uploadCallDetailsController = async (
  req: DeviceRequest,
  res: Response,
): Promise<void> => {
  if (!req.device?._id) throw new AppError(401, 'Invalid device credentials');
  sendOk(res, 'Call record created successfully', await createCall(req.device._id, req.body));
};

export const listCallsController = async (req: Request, res: Response): Promise<void> => {
  const query = listCallsQuerySchema.parse(req.query);
  sendOk(res, 'Calls fetched successfully', await listCalls(query));
};

export const fetchSingleCallDetailController = async (
  req: IdParams,
  res: Response,
): Promise<void> => {
  sendOk(res, 'Call details fetched successfully', await singleCallDocDetails(req.params.id));
};

export const requestPresignedUrl = async (
  req: ClientCallIdParams,
  res: Response,
): Promise<void> => {
  if (!req.device?._id) throw new AppError(401, 'Invalid device credentials');
  sendOk(
    res,
    'Url issued successfully',
    await issuePresignedUrlWithClientCallId(req.device._id, req.params.clientCallId),
  );
};

export const updateCallRecordingStatus = async (
  req: ClientCallIdParams,
  res: Response,
): Promise<void> => {
  if (!req.device?._id) throw new AppError(401, 'Invalid device credentials');
  sendOk(
    res,
    'Call status updated successfully',
    await updateStatusOfCallForAudioUpload(req.device._id, req.params.clientCallId, req.body),
  );
};
