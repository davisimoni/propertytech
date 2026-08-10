export interface DashboardMetrics {
  leadsQualified: number;
  documentsAnalyzed: number;
  hoursSaved: number;
}

export const MOCK_DASHBOARD_METRICS: DashboardMetrics = {
  leadsQualified: 24,
  documentsAnalyzed: 8,
  hoursSaved: 16,
};
