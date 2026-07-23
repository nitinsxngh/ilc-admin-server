import PaymentTransaction from '../models/PaymentTransaction.js';
import CounsellorInvoice from '../models/CounsellorInvoice.js';

export function summarizePayment(txn) {
  if (!txn) return null;
  const amountPaise = typeof txn.amount === 'number' ? txn.amount : null;
  return {
    _id: String(txn._id),
    purpose: txn.purpose || '',
    amountPaise,
    amountINR: amountPaise == null ? null : amountPaise / 100,
    currency: txn.currency || 'INR',
    status: txn.status || '',
    receipt: txn.receipt || '',
    razorpayOrderId: txn.razorpayOrderId || '',
    razorpayPaymentId: txn.razorpayPaymentId || '',
    paidAt: txn.paidAt || null,
    createdAt: txn.createdAt || null,
  };
}

export function summarizeInvoice(invoice) {
  if (!invoice) return null;
  return {
    _id: String(invoice._id),
    invoiceNumber: invoice.invoiceNumber || '',
    amountINR: invoice.amountINR ?? null,
    amountPaise: invoice.amountPaise ?? null,
    currency: invoice.currency || 'INR',
    status: invoice.status || '',
    razorpayOrderId: invoice.razorpayOrderId || '',
    razorpayPaymentId: invoice.razorpayPaymentId || '',
    paidAt: invoice.paidAt || null,
    description: invoice.description || '',
    lineItems: Array.isArray(invoice.lineItems)
      ? invoice.lineItems.map((item) => ({
          label: item.label || '',
          amountINR: item.amountINR ?? 0,
        }))
      : [],
  };
}

/**
 * Batch-load payment transactions + invoices for portal booking docs.
 */
export async function loadPaymentContextForPortalBookings(portalDocs = []) {
  const paymentIds = [
    ...new Set(
      portalDocs
        .map((p) => p.paymentTransactionId)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const invoiceIds = [
    ...new Set(
      portalDocs
        .map((p) => p.invoiceId)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const razorpayOrderIds = [
    ...new Set(
      portalDocs
        .map((p) => String(p.razorpayOrderId || '').trim())
        .filter(Boolean)
    ),
  ];
  const bookingIds = portalDocs.map((p) => p._id).filter(Boolean);

  const [paymentsById, paymentsByOrder, invoicesById, invoicesByBooking] = await Promise.all([
    paymentIds.length
      ? PaymentTransaction.find({ _id: { $in: paymentIds } }).lean()
      : Promise.resolve([]),
    razorpayOrderIds.length
      ? PaymentTransaction.find({
          purpose: 'counsellor_session',
          razorpayOrderId: { $in: razorpayOrderIds },
        }).lean()
      : Promise.resolve([]),
    invoiceIds.length
      ? CounsellorInvoice.find({ _id: { $in: invoiceIds } }).lean()
      : Promise.resolve([]),
    bookingIds.length
      ? CounsellorInvoice.find({ bookingId: { $in: bookingIds } }).lean()
      : Promise.resolve([]),
  ]);

  const paymentMap = new Map();
  for (const txn of [...paymentsById, ...paymentsByOrder]) {
    paymentMap.set(String(txn._id), txn);
    if (txn.razorpayOrderId) paymentMap.set(`order:${txn.razorpayOrderId}`, txn);
  }

  const invoiceMap = new Map();
  for (const inv of [...invoicesById, ...invoicesByBooking]) {
    invoiceMap.set(String(inv._id), inv);
    if (inv.bookingId) invoiceMap.set(`booking:${String(inv.bookingId)}`, inv);
  }

  return { paymentMap, invoiceMap };
}

export function resolvePaymentFields(portalDoc, paymentMap, invoiceMap) {
  const payment =
    (portalDoc.paymentTransactionId && paymentMap.get(String(portalDoc.paymentTransactionId))) ||
    (portalDoc.razorpayOrderId && paymentMap.get(`order:${portalDoc.razorpayOrderId}`)) ||
    null;

  const invoice =
    (portalDoc.invoiceId && invoiceMap.get(String(portalDoc.invoiceId))) ||
    invoiceMap.get(`booking:${String(portalDoc._id)}`) ||
    null;

  const paymentSummary = summarizePayment(payment);
  const invoiceSummary = summarizeInvoice(invoice);

  const amountINR =
    invoiceSummary?.amountINR ??
    paymentSummary?.amountINR ??
    (typeof portalDoc.sessionFeeINR === 'number' ? portalDoc.sessionFeeINR : null);

  let paymentStatus = 'unpaid';
  if (invoiceSummary?.status === 'waived') paymentStatus = 'waived';
  else if (invoiceSummary?.status === 'paid' || paymentSummary?.status === 'paid' || portalDoc.paidAt) {
    paymentStatus = 'paid';
  } else if (paymentSummary?.status) paymentStatus = paymentSummary.status;
  else if (portalDoc.status === 'pending_payment') paymentStatus = 'pending';
  else if (portalDoc.status === 'payment_failed') paymentStatus = 'failed';

  return {
    paymentStatus,
    paidAt: portalDoc.paidAt || paymentSummary?.paidAt || invoiceSummary?.paidAt || null,
    razorpayOrderId:
      portalDoc.razorpayOrderId ||
      paymentSummary?.razorpayOrderId ||
      invoiceSummary?.razorpayOrderId ||
      '',
    razorpayPaymentId:
      paymentSummary?.razorpayPaymentId || invoiceSummary?.razorpayPaymentId || '',
    amountINR,
    payment: paymentSummary,
    invoice: invoiceSummary,
  };
}
