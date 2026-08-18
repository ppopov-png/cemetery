import type { ScanSession } from '../smart-scan/capture/scanSessionTypes'

export interface ScanPersistence { saveScan(scan: ScanSession): Promise<void>; getScan(id: string): Promise<ScanSession | null>; listPendingSync(): Promise<ScanSession[]> }
