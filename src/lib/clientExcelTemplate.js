import ExcelJS from 'exceljs'

const HEADERS = ['Client Name', 'Address', 'GSTIN', 'Phone', 'Email', 'Client Type', 'Currency', 'International']

export async function downloadClientTemplate() {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Clients')

  sheet.columns = [
    { header: 'Client Name', key: 'name', width: 28 },
    { header: 'Address', key: 'address', width: 36 },
    { header: 'GSTIN', key: 'gstin', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Client Type', key: 'client_type', width: 18 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'International', key: 'international', width: 14 },
  ]

  // Header styling
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374961' } }
  headerRow.height = 22
  headerRow.alignment = { vertical: 'middle' }

  // One example row to show the expected format
  sheet.addRow({
    name: 'Acme Corp',
    address: '12 MG Road, Chennai, Tamil Nadu, 600002',
    gstin: '33ABCDE1234F1Z5',
    phone: '+91 98765 43210',
    email: 'billing@acme.com',
    client_type: 'PDF Accessibility',
    currency: 'INR',
    international: 'No',
  })

  // Data validation dropdowns for rows 2-500 (Client Type, Currency, International)
  for (let r = 2; r <= 500; r++) {
    sheet.getCell(`F${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"PDF Accessibility,Website & Domain"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Client Type',
      error: 'Please choose either "PDF Accessibility" or "Website & Domain" from the dropdown.',
    }
    sheet.getCell(`G${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"INR,USD,CAD,AUD,EUR,GBP"'],
    }
    sheet.getCell(`H${r}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"Yes,No"'],
    }
  }

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'client-import-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

const CLIENT_TYPE_MAP = {
  'pdf accessibility': 'pdf',
  'pdf': 'pdf',
  'website & domain': 'website',
  'website and domain': 'website',
  'website': 'website',
}

export async function parseClientExcel(file) {
  const wb = new ExcelJS.Workbook()
  const buffer = await file.arrayBuffer()
  await wb.xlsx.load(buffer)
  const sheet = wb.worksheets[0]
  if (!sheet) throw new Error('No worksheet found in the uploaded file')

  const rows = []
  let headerMap = null

  sheet.eachRow((row, rowNumber) => {
    const values = row.values // 1-indexed array, values[0] is undefined
    if (rowNumber === 1) {
      // Build a lowercase header -> column index map so column order doesn't matter
      headerMap = {}
      values.forEach((v, i) => {
        if (typeof v === 'string') headerMap[v.trim().toLowerCase()] = i
      })
      return
    }
    const get = (key) => {
      const idx = headerMap?.[key]
      if (!idx) return ''
      const v = values[idx]
      if (v == null) return ''
      if (typeof v === 'object' && v.text) return String(v.text).trim() // rich text / hyperlink cells
      return String(v).trim()
    }

    const name = get('client name')
    if (!name) return // skip blank rows

    const rawType = get('client type').toLowerCase()
    const rawIntl = get('international').toLowerCase()

    rows.push({
      name,
      address: get('address'),
      gstin: get('gstin').toUpperCase(),
      phone: get('phone'),
      email: get('email'),
      client_type: CLIENT_TYPE_MAP[rawType] || 'pdf',
      currency: get('currency').toUpperCase() || 'INR',
      is_international: rawIntl === 'yes' || rawIntl === 'true',
    })
  })

  return rows
}
