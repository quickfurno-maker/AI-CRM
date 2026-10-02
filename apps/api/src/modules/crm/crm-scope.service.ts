import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  teamMembers,
} from '../../platform/database/schema.js';
import { staffProfiles } from '../staff/staff.schema.js';

export type CrmResourceScope =
  | 'OWN'
  | 'TEAM'
  | 'BRANCH'
  | 'WORKSPACE'
  | 'ORGANIZATION';

export type CrmScopeContext = {
  scope: CrmResourceScope;
  ownerMemberIds?: string[];
  workspaceId?: string;
  branchId?: string;
};

@Injectable()
export class CrmScopeService {
  constructor(private readonly database: DatabaseService) {}

  async resolve(principal: Principal): Promise<CrmScopeContext> {
    const scope =
      (principal.permissionScope as CrmResourceScope | undefined) ??
      'ORGANIZATION';

    if (scope === 'ORGANIZATION') return { scope };

    if (scope === 'OWN') {
      return { scope, ownerMemberIds: [principal.membershipId] };
    }

    if (scope === 'TEAM') {
      const memberships = await this.database.db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.organizationId, principal.organizationId),
            eq(teamMembers.organizationMemberId, principal.membershipId),
          ),
        );
      const teamIds = memberships.map((row) => row.teamId);
      if (!teamIds.length) {
        return { scope, ownerMemberIds: [principal.membershipId] };
      }
      const rows = await this.database.db
        .select({ membershipId: teamMembers.organizationMemberId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.organizationId, principal.organizationId),
            inArray(teamMembers.teamId, teamIds),
          ),
        );
      return {
        scope,
        ownerMemberIds: [
          ...new Set([
            principal.membershipId,
            ...rows.map((row) => row.membershipId),
          ]),
        ],
      };
    }

    const staffRows = await this.database.db
      .select({
        workspaceId: staffProfiles.workspaceId,
        branchId: staffProfiles.branchId,
      })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.organizationId, principal.organizationId),
          eq(staffProfiles.organizationMemberId, principal.membershipId),
          eq(staffProfiles.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    const staff = staffRows[0];

    if (!staff) {
      // Narrow scopes fail closed when the human identity has no staff placement.
      return scope === 'WORKSPACE'
        ? { scope, workspaceId: undefined, ownerMemberIds: [] }
        : { scope, branchId: undefined, ownerMemberIds: [] };
    }

    if (scope === 'WORKSPACE') {
      return { scope, workspaceId: staff.workspaceId };
    }

    if (!staff.branchId) {
      return { scope, branchId: undefined, ownerMemberIds: [] };
    }

    const rows = await this.database.db
      .select({ membershipId: staffProfiles.organizationMemberId })
      .from(staffProfiles)
      .where(
        and(
          eq(staffProfiles.organizationId, principal.organizationId),
          eq(staffProfiles.branchId, staff.branchId),
          eq(staffProfiles.status, 'ACTIVE'),
        ),
      );

    return {
      scope,
      branchId: staff.branchId,
      ownerMemberIds: rows
        .map((row) => row.membershipId)
        .filter((value): value is string => Boolean(value)),
    };
  }

  async assertAssignment(
    principal: Principal,
    ownerMemberId: string | null | undefined,
    workspaceId: string,
  ) {
    const context = await this.resolve(principal);

    if (context.scope === 'ORGANIZATION') return;

    if (context.scope === 'WORKSPACE') {
      if (!context.workspaceId || context.workspaceId !== workspaceId) {
        throw new ForbiddenException(
          'Workspace is outside the current permission scope.',
        );
      }
      return;
    }

    if (
      !ownerMemberId ||
      !context.ownerMemberIds?.includes(ownerMemberId)
    ) {
      throw new ForbiddenException(
        'Owner is outside the current permission scope.',
      );
    }
  }

  canReadRow(
    context: CrmScopeContext,
    row: {
      ownerMemberId?: string | null;
      workspaceId?: string | null;
    },
  ) {
    if (context.scope === 'ORGANIZATION') return true;
    if (context.scope === 'WORKSPACE') {
      return Boolean(
        context.workspaceId && row.workspaceId === context.workspaceId,
      );
    }
    return Boolean(
      row.ownerMemberId &&
        context.ownerMemberIds?.includes(row.ownerMemberId),
    );
  }
}
