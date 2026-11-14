import type { RuleDraft } from './rules.ts';
import type { Monitor } from './types.ts';

export type AlertRequest =
  | { operation: 'list' }
  | { operation: 'save'; draft: RuleDraft; ruleId: number; enabled: boolean; itemId?: string; revision?: string }
  | { operation: 'delete'; itemId: string; revision: string };

export interface AlertResponse {
  workspaceId: string;
  databaseItemId: string;
  rules?: Monitor[];
  rule?: Monitor;
  deleted?: boolean;
}
