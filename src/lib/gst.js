// GST rules:
// - Tamil Nadu clients (GSTIN starts with "33") -> 9% CGST + 9% SGST (18% total)
// - All other states -> 18% IGST
// - If client has no GSTIN at all, we still split by address-derived state if
//   possible; otherwise we fall back to asking the caller to pass isTamilNadu.

export const GST_RATE = 0.18

export function isTamilNaduGSTIN(gstin) {
  if (!gstin) return null // unknown
  const trimmed = gstin.trim()
  if (trimmed.length < 2) return null
  return trimmed.startsWith('33')
}

/**
 * @param {number} subtotal - sum of line items before tax
 * @param {boolean} isTamilNadu - true => CGST+SGST, false => IGST
 */
export function calculateGST(subtotal, isTamilNadu) {
  const round2 = (n) => Math.round(n * 100) / 100
  if (isTamilNadu) {
    const cgst = round2(subtotal * (GST_RATE / 2))
    const sgst = round2(subtotal * (GST_RATE / 2))
    return {
      cgst,
      sgst,
      igst: 0,
      total: round2(subtotal + cgst + sgst),
    }
  }
  const igst = round2(subtotal * GST_RATE)
  return {
    cgst: 0,
    sgst: 0,
    igst,
    total: round2(subtotal + igst),
  }
}

export function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount || 0)
}

export function lineTotal(entry) {
  if (entry.entry_type === 'pdf') {
    return (Number(entry.pages) || 0) * (Number(entry.rate_per_page) || 0)
  }
  return (
    (Number(entry.website_renewal_price) || 0) +
    (Number(entry.google_subscription_price) || 0) +
    (Number(entry.other_price) || 0)
  )
}
