import { body } from 'express-validator';

const counsellorBodyValidators = [
  body('firstName').trim().notEmpty().withMessage('First name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2–50 characters.'),
  body('lastName').optional({ values: 'falsy' }).trim().isLength({ max: 50 })
    .withMessage('Last name must be 50 characters or fewer.'),
  body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password').optional({ values: 'falsy' }).isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('phone').optional({ values: 'falsy' }).trim()
    .customSanitizer((value) => String(value || '').replace(/[\s-]/g, ''))
    .matches(/^(\+91)?[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number.'),
  body('designation').trim().notEmpty().withMessage('Designation is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Designation must be 2–100 characters.'),
  body('bio').optional({ values: 'falsy' }).isLength({ max: 2000 })
    .withMessage('Bio must be 2000 characters or fewer.'),
  body('sessionFee').isInt({ min: 1, max: 100000 })
    .withMessage('Session fee must be a whole number between ₹1 and ₹1,00,000.'),
  body('sessionDuration').isInt({ min: 15, max: 240 })
    .withMessage('Session duration must be between 15 and 240 minutes.')
    .custom((value) => value % 5 === 0)
    .withMessage('Session duration must be in 5-minute steps.'),
  body('experienceYears').optional({ values: 'falsy' }).isInt({ min: 0, max: 60 })
    .withMessage('Experience must be between 0 and 60 years.'),
  body('languages').isArray({ min: 1 }).withMessage('Select at least one language.'),
  body('specializations').isArray({ min: 1 }).withMessage('Select at least one specialization.'),
];

export { counsellorBodyValidators };
