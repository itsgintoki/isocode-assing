import type {
  CalibrationData,
  Candidate,
  CandidateDetail,
  ConsentData,
  KpiData,
  PipelineData,
  Requisition,
  Scorecard,
  UploadResult,
  User
} from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body,
    credentials: 'include'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error || 'Something went wrong. Please try again.', response.status);
  }
  return payload as T;
}

export const authApi = {
  me: () => api<{ user: User }>('/api/auth/me'),
  demoAccounts: () => api<{ users: User[] }>('/api/auth/demo-accounts'),
  login: (email: string, password: string) =>
    api<{ user: User }>('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<{ success: boolean }>('/api/auth/logout', { method: 'POST' })
};

export const requisitionApi = {
  list: () => api<{ requisitions: Requisition[] }>('/api/requisitions'),
  get: (id: string) => api<{ requisition: Requisition; stageStats: Array<{ pipeline_stage: string; count: number }> }>(`/api/requisitions/${id}`),
  intakeJd: (rawJdText: string, jobTitle?: string) =>
    api<{ scorecard: Scorecard }>('/api/requisitions/intake-jd', {
      method: 'POST',
      body: { rawJdText, jobTitle }
    }),
  create: (body: Record<string, unknown>) =>
    api<{ success: boolean; requisitionId: string }>('/api/requisitions', { method: 'POST', body }),
  updateScorecard: (id: string, scorecard: Scorecard) =>
    api<{ success: boolean; message: string; scorecard: Scorecard; recalculatedCount: number }>(
      `/api/requisitions/${id}/scorecard`,
      { method: 'PUT', body: { scorecard } }
    )
};

export const candidateApi = {
  list: (params: URLSearchParams) => api<{ candidates: Candidate[]; totalCount: number; blindMode: boolean }>(`/api/candidates?${params.toString()}`),
  detail: (id: string, requisitionId: string) =>
    api<CandidateDetail>(`/api/candidates/${id}?requisitionId=${encodeURIComponent(requisitionId)}`),
  verify: (id: string, requisitionId: string, notes: string) =>
    api<{ success: boolean; candidateId: string; recruiter_verified: number; verifiedBy: string }>(
      `/api/candidates/${id}/verify`,
      { method: 'POST', body: { requisitionId, notes } }
    ),
  upload: (requisitionId: string, files: File[]) => {
    const formData = new FormData();
    formData.append('requisitionId', requisitionId);
    files.forEach((file) => formData.append('cvFiles', file));
    return api<{ success: boolean; results: UploadResult }>('/api/candidates/upload', {
      method: 'POST',
      body: formData
    });
  }
};

export const pipelineApi = {
  get: (requisitionId: string) => api<PipelineData>(`/api/pipeline/${encodeURIComponent(requisitionId)}`),
  move: (requisitionId: string, candidateId: string, targetStage: string, notes?: string, rejectionReason?: string) =>
    api<{ success: boolean; message: string; newStage: string }>('/api/pipeline/move', {
      method: 'POST',
      body: { requisitionId, candidateId, targetStage, notes, rejectionReason }
    })
};

export const clientApi = {
  shortlist: (requisitionId: string) =>
    api<{
      requisition: Pick<Requisition, 'id' | 'title' | 'client_company' | 'location' | 'min_exp' | 'max_exp' | 'max_notice_days'>;
      candidates: Candidate[];
    }>(`/api/client/shortlist/${encodeURIComponent(requisitionId)}`),
  action: (body: Record<string, unknown>) =>
    api<{ success: boolean; message: string; newStage: string }>('/api/client/action', { method: 'POST', body })
};

export const adminApi = {
  resetDemoData: () =>
    api<{ success: boolean; message: string }>('/api/admin/reset-sample-data', { method: 'POST' })
};

export const analyticsApi = {
  calibration: () => api<CalibrationData>('/api/analytics/calibration-audits'),
  createCalibration: (body: {
    weekLabel: string;
    requisitionId: string;
    candidateId: string;
    aiRank: number;
    recruiterRank: number;
    overrideReason: string;
  }) =>
    api<{ success: boolean; id: string; discrepancyScore: number; agreementStatus: string }>(
      '/api/analytics/calibration-audits',
      { method: 'POST', body }
    ),
  kpis: () => api<KpiData>('/api/analytics/kpi-metrics')
};

export const complianceApi = {
  auditLogs: (candidateId?: string, limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (candidateId) params.set('candidateId', candidateId);
    return api<{ logs: import('../types').AuditLogEntry[] }>(`/api/dpdp/audit-logs?${params.toString()}`);
  },
  consents: () => api<ConsentData>('/api/dpdp/consents'),
  erase: (candidateId: string, reason: string) =>
    api<{ success: boolean; message: string; result: { success: boolean; receipt: string; candidateId: string } }>(
      '/api/dpdp/erasure-request',
      { method: 'POST', body: { candidateId, reason } }
    )
};
