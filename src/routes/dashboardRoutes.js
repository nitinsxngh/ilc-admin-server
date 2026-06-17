import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(...adminAuth);
router.get('/stats', requirePermission('dashboard'), getDashboardStats);

export default router;
