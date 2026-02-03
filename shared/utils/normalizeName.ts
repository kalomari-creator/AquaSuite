export function normalizeName(input: string): string {
  if (!input) return ''
  let s = String(input).toLowerCase().trim()
  s = s.replace(/\([^)]*\)/g, ' ')
  s = s.replace(/[.,]/g, ' ')
  s = s.replace(/\b(coach|sub|deck|instructor)\b/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim())
    if (parts.length >= 2) {
      s = `${parts.slice(1).join(' ')} ${parts[0]}`.replace(/\s+/g, ' ').trim()
    }
  }

  s = s.replace(/[^a-z\s]/g, '')
  return s.replace(/\s+/g, ' ').trim()
}
