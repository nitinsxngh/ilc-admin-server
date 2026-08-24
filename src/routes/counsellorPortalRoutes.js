import { Router } from 'express';
import { attachCounsellorUser, authenticateCounsellor } from '../middleware/counsellorAuth.js';
import {
  counsellorLogin,
  counsellorMe,
  getCounsellorChat,
  getCounsellorStudent,
  listCounsellorStudents,
  sendCounsellorChat,
  updateCounsellorDocument,
  updateCounsellorJourney,
} from '../controllers/counsellorPortalController.js';

const router = Router();

router.post('/login', counsellorLogin);
router.use(authenticateCounsellor, attachCounsellorUser);
router.get('/me', counsellorMe);
router.get('/students', listCounsellorStudents);
router.get('/students/:id', getCounsellorStudent);
router.patch('/students/:id/journey', updateCounsellorJourney);
router.patch('/students/:id/documents/:documentId', updateCounsellorDocument);
router.get('/students/:id/chat', getCounsellorChat);
router.post('/students/:id/chat', sendCounsellorChat);

export default router;
