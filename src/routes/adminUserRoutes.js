import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listAdminUsers,
  getAdminUser,
  createAdminUser,
  updateAdminUser,
  updateAdminUserStatus,
  deleteAdminUser,
} from '../controllers/adminUserController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requireSuperAdmin, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(...adminAuth);
router.use(requirePermission('settings.users'));

router.get('/', listAdminUsers);
router.get('/:id', [param('id').isMongoId()], validate, getAdminUser);

router.post(
  '/',
  requireSuperAdmin,
  [
    body('firstName').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('roleId').isMongoId(),
    body('pageAccess').optional().isArray(),
  ],
  validate,
  createAdminUser
);

router.put('/:id', [param('id').isMongoId()], validate, requireSuperAdmin, updateAdminUser);

router.patch(
  '/:id/status',
  requireSuperAdmin,
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  validate,
  updateAdminUserStatus
);

router.delete('/:id', [param('id').isMongoId()], validate, requireSuperAdmin, deleteAdminUser);

export default router;
