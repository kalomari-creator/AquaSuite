import { normalizeName } from ../../utils/normalizeName.js

export type IntakePayload = {
  gmailMessageId: string
  receivedAt?: string
  rawSubject?: string
  rawBody?: string
  locationNameRaw?: string
  clientName?: string
  preferredDay?: string
  preferredTime?: string
  contactPhone?: string
  contactEmail?: string
  instructorPrimary?: string
  instructorSecondary?: string
  code?: string
  scoreGoal?: number
  scoreStructure?: number
  scoreConnection?: number
  scoreValue?: number
  level?: string
  ratio?: string
  why?: string
  enrollmentLink?: string
}

export function parseIntakeFromEmail(subject: string, body: string, gmailMessageId: string, receivedAt?: string): IntakePayload {
  const payload: IntakePayload = {
    gmailMessageId,
    receivedAt,
    rawSubject: subject,
    rawBody: body
  }

  const subjectMatch = subject.match(/^New Intake\s+—\s+(.+?)\s*\((.+)\)\s*$/)
  if (subjectMatch) {
    payload.clientName = subjectMatch[1].trim()
    payload.locationNameRaw = subjectMatch[2].trim()
  }

  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const findLine = (label: string) => lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase()))
  const findLineIndex = (label: string) => lines.findIndex((l) => l.toLowerCase().startsWith(label.toLowerCase()))
  const extractValue = (label: string) => {
    const line = findLine(label)
    if (!line) return undefined
    return line.split(:).slice(1).join(:).trim()
  }
  const extractNextLine = (label: string) => {
    const idx = findLineIndex(label)
    if (idx === -1) return undefined
    const next = lines[idx + 1]
    if (!next) return undefined
    return next.trim()
  }

  payload.locationNameRaw = payload.locationNameRaw || extractValue(Location)
  payload.preferredDay = extractValue(Preferred day)
  payload.preferredTime = extractValue(Preferred time)
  payload.contactPhone = extractValue(Contact Phone) || extractValue(Phone)
  payload.contactEmail = extractValue(Contact Email) || extractValue(Email)
  payload.instructorPrimary = extractValue(Primary)
  payload.instructorSecondary = extractValue(Secondary)
  payload.code = extractValue(Code)

  const contactLine = extractValue(Contact) || findLine(Contact)
  if (contactLine) {
    const phoneMatch = contactLine.match(/phone\s*:\s*([+()\d\s-]+)/i)
    if (phoneMatch && !payload.contactPhone) payload.contactPhone = phoneMatch[1].trim()
    const emailMatch = contactLine.match(/email\s*:\s*([^\s]+)/i)
    if (emailMatch && !payload.contactEmail) payload.contactEmail = emailMatch[1].trim()
  }

  const scoreGoal = extractValue(Goal Score)
  if (scoreGoal) payload.scoreGoal = Number(scoreGoal) || undefined
  const scoreStructure = extractValue(Structure Score)
  if (scoreStructure) payload.scoreStructure = Number(scoreStructure) || undefined
  const scoreConnection = extractValue(Connection Score)
  if (scoreConnection) payload.scoreConnection = Number(scoreConnection) || undefined
  const scoreValue = extractValue(Value Score)
  if (scoreValue) payload.scoreValue = Number(scoreValue) || undefined

  const scoresLine = extractValue(Scores) || findLine(Scores)
  if (scoresLine) {
    const goal = scoresLine.match(/Goal\s*(\d+)/i)
    const structure = scoresLine.match(/Structure\s*(\d+)/i)
    const connection = scoresLine.match(/Connection\s*(\d+)/i)
    const value = scoresLine.match(/Value\s*(\d+)/i)
    if (goal && payload.scoreGoal === undefined) payload.scoreGoal = Number(goal[1])
    if (structure && payload.scoreStructure === undefined) payload.scoreStructure = Number(structure[1])
    if (connection && payload.scoreConnection === undefined) payload.scoreConnection = Number(connection[1])
    if (value && payload.scoreValue === undefined) payload.scoreValue = Number(value[1])
  }

  payload.level = extractValue(Level)
  payload.ratio = extractValue(Ratio)
  payload.why = extractValue(Why)
  payload.enrollmentLink = extractValue(Enrollment Link) || extractNextLine(Enrollment Link)
  if (payload.enrollmentLink && !payload.enrollmentLink.startsWith(http)) {
    const maybe = extractNextLine(payload.enrollmentLink)
    if (maybe && maybe.startsWith(http)) payload.enrollmentLink = maybe
  }

  if (!payload.clientName) {
    const nameLine = extractValue(Name)
    if (nameLine) payload.clientName = nameLine
  }

  if (payload.clientName) {
    payload.clientName = normalizeName(payload.clientName).replace(/\b\w/g, (m) => m.toUpperCase())
  }

  return payload
}
