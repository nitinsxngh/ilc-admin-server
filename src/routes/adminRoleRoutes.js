import { Router } from 'express';
import { body } from 'express-validator';
import { listRoles, listPermissions, createRole } from '../controllers/adminRoleController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission, requireSuperAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/permissions', ...adminAuth, requirePermission('settings.users'), listPermissions);

router.use(...adminAuth);

router.get('/', requirePermission('settings.roles', 'settings.users'), listRoles);

router.post(
  '/',
  requireSuperAdmin,
  requirePermission('settings.roles'),
  [body('name').trim().notEmpty()],
  validate,
  createRole
);

export default router;
