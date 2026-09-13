export interface AvailableUpdate {
  version: string;
  versionCode: number;
  releaseDate?: string;
  downloadUrl: string;
  fileSize?: number;
  sha256?: string;
  releaseNotes?: string;
  source: 'cloud' | 'github';
  discoveredAt: number;
}

export interface DownloadProgress {
  percent: number;
  received: number;
  total: number;
}

export type UpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'has_update'
  | 'up_to_date'
  | 'downloading'
  | 'downloaded'
  | 'error';
