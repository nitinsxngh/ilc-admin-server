import { Router } from 'express';
import { body } from 'express-validator';
import { login, getMe } from '../controllers/authController.js';
import { authenticate, attachAdminUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  login
);

router.get('/me', authenticate, attachAdminUser, getMe);

export default router;
