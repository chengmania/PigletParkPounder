import { computeStats, type PotaStats } from '../pota-stats.ts';
import type { Operator, Qso } from '../types.ts';

export interface OperatorSummary {
  call: string;
  name?: string;
  qsoCount: number;
}

export interface SummaryReport {
  stats: PotaStats;
  operators: OperatorSummary[];
}

export function toSummaryReport(qsos: readonly Qso[], operators: readonly Operator[]): SummaryReport {
  const stats = computeStats(qsos);
  const operatorSummaries: OperatorSummary[] = operators.map((op) => ({
    call: op.call,
    name: op.name,
    qsoCount: stats.perOperator[op.call] ?? 0,
  }));

  return { stats, operators: operatorSummaries };
}
