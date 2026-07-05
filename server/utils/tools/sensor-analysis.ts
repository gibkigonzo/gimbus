import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { z } from 'zod'
import { structuredChat } from '../openrouter'

interface SensorReading {
  sensor_type: string
  timestamp: number
  temperature_K: number
  pressure_bar: number
  water_level_meters: number
  voltage_supply_v: number
  humidity_percent: number
  operator_notes: string
}

const VALID_RANGES = {
  temperature_K: { min: 553, max: 873 },
  pressure_bar: { min: 60, max: 160 },
  water_level_meters: { min: 5.0, max: 15.0 },
  voltage_supply_v: { min: 229.0, max: 231.0 },
  humidity_percent: { min: 40.0, max: 80.0 },
}

const SENSOR_TYPE_TO_FIELD: Record<string, keyof SensorReading> = {
  temperature: 'temperature_K',
  pressure: 'pressure_bar',
  water: 'water_level_meters',
  voltage: 'voltage_supply_v',
  humidity: 'humidity_percent',
}

function hasSensorTypeMismatch(reading: SensorReading): boolean {
  const declaredActive = new Set(
    reading.sensor_type.split('/').map(s => s.trim().toLowerCase()).filter(Boolean)
  )
  for (const [typeName, field] of Object.entries(SENSOR_TYPE_TO_FIELD)) {
    const isActive = declaredActive.has(typeName)
    const hasValue = (reading[field] as number) !== 0
    if (isActive !== hasValue) return true
  }
  return false
}

function getOutOfRangeFields(reading: SensorReading): string[] {
  const out: string[] = []
  const check = (field: keyof typeof VALID_RANGES, value: number) => {
    if (value === 0) return // 0 = inactive sensor, always valid
    const { min, max } = VALID_RANGES[field]
    if (value < min || value > max) {
      out.push(`${field}=${value} (valid: ${min}–${max})`)
    }
  }
  check('temperature_K', reading.temperature_K)
  check('pressure_bar', reading.pressure_bar)
  check('water_level_meters', reading.water_level_meters)
  check('voltage_supply_v', reading.voltage_supply_v)
  check('humidity_percent', reading.humidity_percent)
  return out
}

const MismatchSchema = z.object({
  flagged: z
    .array(z.object({
      file_number: z.string().describe('Sensor file number, e.g. "0042"'),
      mismatch_type: z.enum(['ok_notes_but_invalid_data', 'problem_notes_but_valid_data']),
    }))
    .describe('Entries where operator notes contradict the actual sensor data state'),
})

export const analyzeSensorsTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'analyze_sensors',
    description:
      'Analyze all sensor readings from playground/sensors/ and return the file numbers where data is invalid or operator notes contradict the readings.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
}

const PROMPT = `You are a sensor data quality analyst.

All entries you receive have already been verified — their sensor readings are within valid ranges. Your only job is to read operator_notes and detect lies.

An operator is lying if their notes report a problem (anomaly, failure, drift, abnormal, malfunction, error, alarm, incorrect, deviation, issue, fault) even though the data is confirmed valid.

Flag every entry where the operator falsely reports a problem. Return file_number with mismatch_type = "problem_notes_but_valid_data".

Do NOT flag entries where notes indicate everything is fine (normal, stable, OK, calm, no issues, pass, clear).`

export async function handleAnalyzeSensors(
  _rawArgs: Record<string, unknown>,
  model: string
): Promise<unknown> {
  const sensorsDir = resolve('./playground/sensors')

  // Load all sensor files in parallel
  const fileNames = (await readdir(sensorsDir)).filter(f => f.endsWith('.json')).sort()

  const allData = new Map<string, SensorReading>()
  await Promise.all(
    fileNames.map(async (file) => {
      const num = file.replace('.json', '')
      const content = await readFile(resolve(sensorsDir, file), 'utf-8')
      allData.set(num, JSON.parse(content) as SensorReading)
    })
  )

  // Step 1: Programmatic split — invalid (out-of-range or sensor_type mismatch) vs valid
  const invalidFileNumbers: string[] = []
  const validGroup: Array<{ file_number: string; sensor_type: string; temperature_K: number; pressure_bar: number; water_level_meters: number; voltage_supply_v: number; humidity_percent: number; operator_notes: string }> = []

  for (const [num, reading] of allData) {
    const outOfRange = getOutOfRangeFields(reading)
    const typeMismatch = hasSensorTypeMismatch(reading)
    if (outOfRange.length > 0 || typeMismatch) {
      invalidFileNumbers.push(num)
    } else {
      validGroup.push({
        file_number: num,
        sensor_type: reading.sensor_type,
        temperature_K: reading.temperature_K,
        pressure_bar: reading.pressure_bar,
        water_level_meters: reading.water_level_meters,
        voltage_supply_v: reading.voltage_supply_v,
        humidity_percent: reading.humidity_percent,
        operator_notes: reading.operator_notes,
      })
    }
  }

  // Step 2: Three arrays — each deduped by its respective key position in operator_notes
  const seenKey1 = new Set<string>()
  const validByKey1 = validGroup.filter(e => {
    const key = e.operator_notes.split(',')[0]?.trim().toLowerCase() ?? ''
    if (!key || seenKey1.has(key)) return false
    seenKey1.add(key)
    return true
  })

  const seenKey2 = new Set<string>()
  const validByKey2 = validGroup.filter(e => {
    const key = e.operator_notes.split(',')[1]?.trim().toLowerCase() ?? ''
    if (!key || seenKey2.has(key)) return false
    seenKey2.add(key)
    return true
  })

  const seenKey3 = new Set<string>()
  const validByKey3 = validGroup.filter(e => {
    const key = e.operator_notes.split(',')[2]?.trim().toLowerCase() ?? ''
    if (!key || seenKey3.has(key)) return false
    seenKey3.add(key)
    return true
  })

  const seenFileNums = new Set<string>()
  console.log('Groups sizes:', validByKey1.length, validByKey2.length, validByKey3.length)
  const validGroupDeduped = [...validByKey1, ...validByKey2, ...validByKey3].filter(e => {
    if (seenFileNums.has(e.file_number)) return false
    seenFileNums.add(e.file_number)
    return true
  })

  const BATCH_SIZE = 100
  const batches: Array<typeof validGroupDeduped> = []
  for (let i = 0; i < validGroupDeduped.length; i += BATCH_SIZE) {
    batches.push(validGroupDeduped.slice(i, i + BATCH_SIZE))
  }

  console.log('CCCCCCCCHUUUUUUK', validGroupDeduped.length, invalidFileNumbers.length)
  const batchResults = await Promise.all(
    batches.map(batch => structuredChat(
      [{ role: 'system', content: PROMPT }, { role: 'user', content: JSON.stringify(batch.map(e => ({ file_number: e.file_number, operator_notes: e.operator_notes }))) }],
      MismatchSchema,
      model
    ))
  )
  const flagged = batchResults.flatMap(r => r.flagged)

  // Final: programmatic invalids + AI-flagged
  const allInvalidNumbers = [
    ...invalidFileNumbers.map(f => ({ file_number: f, mismatch_type: 'out_of_range' })),
    ...flagged,
  ].sort((a, b) => a.file_number.localeCompare(b.file_number))

  // Step 4: Send results to verification endpoint
  const recheck = allInvalidNumbers.map(e => e.file_number)
  const verifyResponse = await fetch('https://hub.ag3nts.org/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: process.env.USER_ID ?? '',
      task: 'evaluation',
      answer: { recheck },
    }),
  })
  const verifyResult = await verifyResponse.json() as { message?: string; [key: string]: unknown }
  console.log('Verification response status:', verifyResult)

  return {
    total_files: fileNames.length,
    total_invalid_count: allInvalidNumbers.length,
    invalid_files: allInvalidNumbers,
    verification_message: verifyResult.message ?? null,
  }
}
