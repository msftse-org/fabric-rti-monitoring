import { AudienceType, UserDataFunctions, type RayfinContext } from '@microsoft/fabric-user-data-functions';
import { AlertService, appCoordinates } from './alerts.js';
import type { AlertRequest } from '../../../../oncall/src/live.ts';

const udf = new UserDataFunctions();

udf.func('alertRules', async (ctx: RayfinContext<Record<string, never>, AudienceType.Fabric>, request: string): Promise<string> => {
  if (typeof request !== 'string' || request.length > 20_000) throw new Error('The alert request is too large.');
  const { workspaceId, appId } = appCoordinates(ctx.baseUrl);
  return JSON.stringify(await new AlertService(workspaceId, appId, ctx.Tokens.Fabric).handle(JSON.parse(request) as AlertRequest));
}, []);
