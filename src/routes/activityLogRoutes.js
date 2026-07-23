import { Router } from 'express';
import { listActivityLogs, getActivityLogMeta } from '../controllers/activityLogController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(...adminAuth);
router.use(requirePermission('settings.activity'));

router.get('/meta', getActivityLogMeta);
router.get('/', listActivityLogs);

export default router;
