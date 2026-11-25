import { parseNumber } from './model.ts';

export interface CostComparison {
  method: 'totals' | 'usage';
  sourceMonthly: string;
  targetMonthly: string;
}
export function defaultComparison(): CostComparison {
  return { method: 'usage', sourceMonthly: '', targetMonthly: '' };
}
export function validateComparison(c: CostComparison): Partial<Record<'sourceMonthly' | 'targetMonthly', string>> {
  const errors: Partial<Record<'sourceMonthly' | 'targetMonthly', string>> = {};
  for (const key of ['sourceMonthly', 'targetMonthly'] as const) {
    try {
      if (parseNumber(c[key]) === null) errors[key] = 'Enter the monthly total; use 0 only for a confirmed zero cost.';
    } catch { errors[key] = 'Enter a finite, non-negative monthly amount.'; }
  }
  return errors;
}
export function compareTotals(c: CostComparison) {
  if (Object.keys(validateComparison(c)).length) throw new Error('Enter valid monthly totals before comparing.');
  const source = parseNumber(c.sourceMonthly)!;
  const target = parseNumber(c.targetMonthly)!;
  const difference = source - target;
  return {
    source, target, difference,
    percent: source === 0 ? null : difference / source * 100,
    annualDifference: difference * 12,
    basis: 'Customer-entered monthly totals; not an estimate derived from telemetry volume.',
  };
}
export function restoreComparison(value: unknown): CostComparison {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid comparison settings.');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 3 || !['totals', 'usage'].includes(String(r.method))) throw new Error('Invalid comparison schema.');
  for (const key of ['sourceMonthly', 'targetMonthly'] as const) {
    if (typeof r[key] !== 'string' || r[key].length > 100) throw new Error('Invalid comparison amount.');
    parseNumber(r[key]);
  }
  return { method: r.method as CostComparison['method'], sourceMonthly: r.sourceMonthly as string, targetMonthly: r.targetMonthly as string };
}
