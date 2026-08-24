import jwt from 'jsonwebtoken';
import CounsellorUser from '../models/User.js';

export function authenticateCounsellor(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.typ !== 'counsellor' || !decoded.counsellorId) {
      return res.status(403).json({ success: false, message: 'Counsellor access only' });
    }
    req.counsellor = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export async function attachCounsellorUser(req, res, next) {
  try {
    const user = await CounsellorUser.findById(req.counsellor?.id);
    if (!user || user.status !== 'active' || !user.counsellorId) {
      return res.status(401).json({ success: false, message: 'Counsellor session is no longer valid' });
    }
    req.counsellorUser = user;
    req.counsellor.counsellorId = String(user.counsellorId);
    next();
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to verify counsellor' });
  }
}
