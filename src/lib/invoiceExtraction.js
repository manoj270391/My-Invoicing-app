// Extracts client details (name, GSTIN, email, phone, address) from a
// scanned/exported invoice PDF using the Anthropic API directly from the
// browser. Each PDF is sent as a base64 document block with a prompt asking
// for structured JSON back.

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const EXTRACTION_PROMPT = `You will be shown an invoice PDF. Extract ONLY the BILL TO / client details
(not the sender's own company details). Return ONLY a JSON object, no markdown
fences, no preamble, with exactly these fields (use empty string "" if a field
is genuinely not present in the document):

{
  "client_name": "",
  "gstin": "",
  "email": "",
  "phone": "",
  "address": ""
}

Rules:
- client_name is the company/person being billed (the recipient), not the issuer.
- gstin should only be filled if a 15-character Indian GSTIN is visible for the client.
- address should be the client's billing address as a single string (combine lines with ", ").
- If you are not confident about a field, leave it as "" rather than guessing.
- Return ONLY the JSON object, nothing else.`

export async function extractClientFromInvoice(file) {
  const base64 = await fileToBase64(file)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Extraction failed (${response.status})`)
  }

  const data = await response.json()
  const textBlock = data.content?.find(b => b.type === 'text')
  if (!textBlock) throw new Error('No response from extraction')

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim()
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Could not parse extraction result')
  }

  return {
    client_name: parsed.client_name || '',
    gstin: (parsed.gstin || '').toUpperCase(),
    email: parsed.email || '',
    phone: parsed.phone || '',
    address: parsed.address || '',
  }
}
