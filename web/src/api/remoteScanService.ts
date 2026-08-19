export type RemoteScanObject = { id: string; imageIndex: number; imageUrl: string; maskUrl: string; modelUrl: string; bbox: { x: number; y: number; width: number; height: number } }
export type RemoteScanJob = { jobId: string; status: 'queued' | 'processing' | 'completed' | 'failed'; progress: number; message?: string; objects?: RemoteScanObject[] }
// Current LAN address of the Windows PC running TripoSR. This is only a default;
// the saved value or VITE_SCAN_API_URL still takes precedence.
const DEFAULT_PC_API_URL = 'https://home-pc.tailaf644b.ts.net'
export function getRemoteScanApiUrl() {
  const saved = localStorage.getItem('cemetery.scanApiUrl')
  const validSaved = saved && !/localhost|127\.0\.0\.1|192\.168\./.test(saved) ? saved : null
  const configured = import.meta.env.VITE_SCAN_API_URL
  return validSaved || configured || DEFAULT_PC_API_URL
}
export async function submitRemoteScan(blobs: Blob[], apiUrl: string) { const form = new FormData(); blobs.forEach((blob, i) => form.append('images', blob, `frame-${i + 1}.jpg`)); const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/scan`, { method: 'POST', body: form }); if (!response.ok) throw new Error(`PC API returned HTTP ${response.status}`); return response.json() as Promise<{ jobId: string }> }
export async function getRemoteScanJob(jobId: string, apiUrl: string) { const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/scan/${jobId}`); if (!response.ok) throw new Error(`PC API returned HTTP ${response.status}`); const job = await response.json() as RemoteScanJob; return { ...job, objects: job.objects?.map((object) => ({ ...object, imageUrl: absoluteUrl(apiUrl, object.imageUrl), maskUrl: absoluteUrl(apiUrl, object.maskUrl), modelUrl: absoluteUrl(apiUrl, object.modelUrl) })) } }
function absoluteUrl(apiUrl: string, path: string) { return path.startsWith('http') ? path : `${apiUrl.replace(/\/$/, '')}${path}` }
