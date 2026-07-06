import { BONUS_CATALOG } from '../bonuses.ts';
import { isInEventWindow, scoreLog, type ScoreBreakdown } from '../scoring.ts';
import type { BonusClaim, ClubConfig, Operator, Qso } from '../types.ts';

export interface OperatorSummary {
  call: string;
  name?: string;
  age18OrUnder?: boolean;
  qsoCount: number;
  gotaOperator: boolean;
}

export interface BonusClaimSummary {
  id: string;
  name: string;
  ruleRef: string;
  claimed: boolean;
  eligible: boolean;
  pointsAwarded: number;
}

export interface SummaryReport {
  score: ScoreBreakdown;
  operators: OperatorSummary[];
  youthList: string[];
  bonusClaims: BonusClaimSummary[];
}

export function toSummaryReport(
  qsos: readonly Qso[],
  config: ClubConfig,
  bonuses: ReadonlyMap<string, BonusClaim>,
  operators: readonly Operator[],
): SummaryReport {
  const score = scoreLog(qsos, config, bonuses, operators);
  const eligibleQsos = qsos.filter((q) => !q.deleted && isInEventWindow(q, config));

  const operatorSummaries: OperatorSummary[] = operators.map((op) => {
    const opQsos = eligibleQsos.filter((q) => q.operatorCall === op.call);
    return {
      call: op.call,
      name: op.name,
      age18OrUnder: op.age18OrUnder,
      qsoCount: opQsos.length,
      gotaOperator: opQsos.some((q) => q.station === 'GOTA'),
    };
  });

  const youthList = operatorSummaries.filter((op) => op.age18OrUnder && op.qsoCount > 0).map((op) => op.call);

  const bonusClaims: BonusClaimSummary[] = BONUS_CATALOG.map((def) => {
    const claim = score.perBonus[def.id];
    return {
      id: def.id,
      name: def.name,
      ruleRef: def.ruleRef,
      claimed: claim?.claimed ?? false,
      eligible: claim?.eligible ?? false,
      pointsAwarded: claim?.pointsAwarded ?? 0,
    };
  });

  return { score, operators: operatorSummaries, youthList, bonusClaims };
}
