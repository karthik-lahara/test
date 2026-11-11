import { Router } from 'express';

import { authenticate, requireAdmin } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import { idParamSchema } from '../../core/validation';
import { fetchSingleCallDetailController, listCallsController } from './call.controller';

const router = Router();
const auth = [authenticate, requireAdmin];
const validId = validate(idParamSchema, 'params');

router.get('/', ...auth, listCallsController);

router.get('/:id', ...auth, validId, fetchSingleCallDetailController);
export default router;
