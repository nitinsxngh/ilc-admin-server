import { body } from 'express-validator';

export const schoolMouBodyValidators = [
  body('schoolName').trim().notEmpty().withMessage('School name is required.')
    .isLength({ min: 2, max: 160 }).withMessage('School name must be 2–160 characters.'),
  body('startDate').notEmpty().withMessage('MOU start date is required.')
    .isISO8601().withMessage('Enter a valid MOU start date.'),
  body('expiryDate').notEmpty().withMessage('MOU expiry date is required.')
    .isISO8601().withMessage('Enter a valid MOU expiry date.')
    .custom((value, { req }) => {
      if (new Date(value) < new Date(req.body.startDate)) {
        throw new Error('Expiry date must be on or after the start date.');
      }
      return true;
    }),
  body('price').isFloat({ min: 0, max: 100000000 }).withMessage('Price must be a number of 0 or more.'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive.'),
];
