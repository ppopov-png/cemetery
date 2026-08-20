export type MappingTelemetry = {
  sessionId: string
  status: string
  frame: number
  features: number
  matches: number
  mapPoints: number
  points?: [number, number, number, number?, number?, number?][]
  pose: { x: number; y: number; z: number }
}

const REQUEST_TIMEOUT_MS = 30_000

function endpoint(apiUrl: string, path: string) {
  return `${apiUrl.replace(/\/$/, '')}${path}`
}

async function request(url: string, init: RequestInit, label: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error(`${label}: компьютер не ответил за 30 секунд`)
    }
    if (cause instanceof TypeError) {
      throw new Error(`${label}: нет соединения с компьютером или браузер заблокировал запрос`)
    }
    throw cause
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function startMapping(apiUrl: string) {
  const response = await request(endpoint(apiUrl, '/api/mapping/start'), { method: 'POST' }, 'Запуск mapping')
  if (!response.ok) throw new Error(`Запуск mapping: HTTP ${response.status}`)
  const result = (await response.json()) as { sessionId?: string }
  if (!result.sessionId) throw new Error('Запуск mapping: компьютер вернул ответ без sessionId')
  return result as { sessionId: string }
}

export async function sendMappingFrame(apiUrl: string, sessionId: string, blob: Blob) {
  const form = new FormData()
  form.append('frame', blob, 'frame.jpg')
  const response = await request(endpoint(apiUrl, `/api/mapping/${sessionId}/frame`), { method: 'POST', body: form }, 'Передача кадра')
  if (!response.ok) throw new Error(`Передача кадра: HTTP ${response.status}`)
  return (await response.json()) as MappingTelemetry
}

export async function stopMapping(apiUrl: string, sessionId: string) {
  const response = await request(endpoint(apiUrl, `/api/mapping/${sessionId}/stop`), { method: 'POST' }, 'Остановка mapping')
  if (!response.ok) throw new Error(`Остановка mapping: HTTP ${response.status}`)
  return (await response.json()) as MappingTelemetry
}
