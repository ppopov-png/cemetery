export interface SyncQueue { enqueue(scanId: string): Promise<void>; retry(scanId: string): Promise<void> }
