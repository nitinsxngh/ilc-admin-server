import { authenticate, attachAdminUser } from './auth.js';

/** Standard admin API guard: JWT + fresh DB user with permissions */
export const adminAuth = [authenticate, attachAdminUser];
