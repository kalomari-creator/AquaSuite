import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectReportMetadata } from '../src/parsers/detectReportMetadata.js'
import { parseUsDate } from '../src/utils/reportParsing.js'
import { dedupeWorkQueue, collapseRetentionRows } from '../src/utils/dedupe.js'

test('detectReportMetadata swaps reversed date ranges', () => {
  const html = `<html><body><div>Report Date: 02/05/2026 - 02/01/2026</div></body></html>`
  const meta = detectReportMetadata(html)
  assert.ok(meta.dateRanges.length >= 1, 'date range detected')
  const first = meta.dateRanges[0]
  assert.equal(first.start, '02/01/2026')
  assert.equal(first.end, '02/05/2026')
})

test('parseUsDate normalizes mm/dd/yyyy', () => {
  assert.equal(parseUsDate('2/5/26'), '2026-02-05')
  assert.equal(parseUsDate('02/05/2026'), '2026-02-05')
})

test('dedupeWorkQueue drops enrolled and duplicates', () => {
  const enrolled = new Set(['jane doe'])
  const leads = [
    { full_name: 'Jane Doe', email: 'jane@example.com', phone: '111' },
    { full_name: 'John Smith', email: 'john@example.com', phone: '222' },
    { full_name: 'John Smith', email: 'john@example.com', phone: '222' }, // dup
    { full_name: 'John Smith', email: 'john.s@example.com', phone: '222' }, // new email
  ]
  const result = dedupeWorkQueue(leads, enrolled)
  assert.equal(result.length, 2)
  assert.equal(result[0].full_name, 'John Smith')
  assert.equal(result[1].full_name, 'John Smith')
})

test('collapseRetentionRows keeps one row per instructor', () => {
  const rows = [
    { instructor_name: 'Alex A', booked: 10 },
    { instructor_name: 'alex a', booked: 12 }, // dup
    { instructor_name: 'Blair B', booked: 5 }
  ]
  const collapsed = collapseRetentionRows(rows)
  assert.equal(collapsed.length, 2)
})
