import { Router } from 'express';
import authRoutes from './authRoutes.js';
import counsellorRoutes from './counsellorRoutes.js';
import availabilityRoutes from './availabilityRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import specializationRoutes from './specializationRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import adminUserRoutes from './adminUserRoutes.js';
import adminRoleRoutes from './adminRoleRoutes.js';
import psychometricRoutes from './psychometricRoutes.js';
import schoolMouRoutes from './schoolMouRoutes.js';
import eLibraryRoutes from './eLibraryRoutes.js';
import activityLogRoutes from './activityLogRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import counsellorPortalRoutes from './counsellorPortalRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/counsellor-portal', counsellorPortalRoutes);
router.use('/admin-users', adminUserRoutes);
router.use('/admin-roles', adminRoleRoutes);
router.use('/counsellors', counsellorRoutes);
router.use('/availability', availabilityRoutes);
router.use('/bookings', bookingRoutes);
router.use('/specializations', specializationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/psychometric', psychometricRoutes);
router.use('/school-mous', schoolMouRoutes);
router.use('/e-library', eLibraryRoutes);
router.use('/activity-logs', activityLogRoutes);
router.use('/notifications', notificationRoutes);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'ILC Counsellor API is running' });
});

export default router;
