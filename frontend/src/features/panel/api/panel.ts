import type { z } from 'zod';
import type { Declared, PutServicesRequest, StartClaimRequest } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const startClaim = (body: StartClaimRequest) => callBff('startClaim', { body });

export const verifyClaim = (claimId: string) => callBff('verifyClaim', { params: { claimId } });

export const updateDeclared = (profileId: string, body: Declared) =>
  callBff('updateDeclared', { params: { profileId }, body });

export const putServices = (profileId: string, body: z.input<typeof PutServicesRequest>) =>
  callBff('putServices', { params: { profileId }, body });
