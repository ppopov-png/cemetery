import type { CapturedFrame } from '../smart-scan/capture/scanSessionTypes'

export type DeepOCRRequest = { scanId: string; frames: CapturedFrame[] }
export type DeepOCRResult = { rawText: string; fields?: { surname?: string; name?: string; patronymic?: string; birthDate?: string; deathDate?: string }; confidence?: number; modelVersion?: string }
