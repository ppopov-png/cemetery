import type { CapturedFrame } from '../smart-scan/capture/scanSessionTypes'

export type QuickOCRResult = { rawText: string; confidence?: number; provider?: string }
export interface QuickOCRProvider { readonly name: string; isSupported(): Promise<boolean>; load(): Promise<void>; recognize(frames: CapturedFrame[]): Promise<QuickOCRResult>; unload(): Promise<void> }
