import { Router } from 'express';
import { listRecentNotifications } from '../controllers/notificationController.js';
import { adminAuth } from '../middleware/adminAuth.js';

const router = Router();

router.use(...adminAuth);
router.get('/', listRecentNotifications);

export default router;
