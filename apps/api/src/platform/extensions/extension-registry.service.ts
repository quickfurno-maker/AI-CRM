import { Injectable } from '@nestjs/common';
import type { Principal } from '../auth/auth.types.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

export type ExtensionManifest = {
  key: string;
  name: string;
  version: string;
  entitlement: string;
  description: string;
  objects: string[];
  permissions: string[];
  events: string[];
  aiTools: string[];
  navigation: { label: string; href: string };
};

const MANIFESTS: ExtensionManifest[] = [
  {
    key: 'real-estate',
    name: 'Real Estate',
    version: '1.0.0',
    entitlement: 'extension.realestate',
    description:
      'Property inventory, buyer requirements, matching, site visits, offers, bookings, brokers and commissions.',
    objects: [
      'Developer',
      'Project',
      'Building',
      'Unit',
      'PropertyOwner',
      'Broker',
      'Requirement',
      'RequirementMatch',
      'SiteVisit',
      'Offer',
      'Booking',
      'Commission',
    ],
    permissions: [
      'realestate.inventory.read',
      'realestate.inventory.manage',
      'realestate.requirement.read',
      'realestate.requirement.manage',
      'realestate.visit.read',
      'realestate.visit.manage',
      'realestate.booking.read',
      'realestate.booking.manage',
    ],
    events: [
      'realestate.developer.created.v1',
      'realestate.project.created.v1',
      'realestate.building.created.v1',
      'realestate.property_owner.upserted.v1',
      'realestate.broker.upserted.v1',
      'realestate.unit.created.v1',
      'realestate.unit.updated.v1',
      'realestate.requirement.created.v1',
      'realestate.requirement.updated.v1',
      'realestate.requirement.matched.v1',
      'realestate.site_visit.scheduled.v1',
      'realestate.site_visit.updated.v1',
      'realestate.site_visit.completed.v1',
      'realestate.offer.created.v1',
      'realestate.booking.created.v1',
      'realestate.booking.updated.v1',
      'realestate.booking.confirmed.v1',
      'realestate.booking.cancelled.v1',
      'realestate.commission.created.v1',
    ],
    aiTools: [
      'search_properties',
      'recommend_properties',
      'schedule_site_visit',
    ],
    navigation: { label: 'Real Estate', href: '/real-estate' },
  },
  {
    key: 'attendance',
    name: 'Attendance & Employee Operations',
    version: '1.0.0',
    entitlement: 'extension.attendance',
    description:
      'Employees, departments, shifts, check-in/out, optional location validation, leave, holidays, approvals and attendance reporting.',
    objects: [
      'Department',
      'Employee',
      'Shift',
      'ShiftAssignment',
      'AttendancePolicy',
      'AttendanceEvent',
      'AttendanceRecord',
      'LeaveRequest',
      'Holiday',
    ],
    permissions: [
      'attendance.employee.read',
      'attendance.employee.manage',
      'attendance.department.manage',
      'attendance.shift.read',
      'attendance.shift.manage',
      'attendance.self.punch',
      'attendance.self.leave',
      'attendance.record.read',
      'attendance.record.manage',
      'attendance.leave.read',
      'attendance.leave.manage',
      'attendance.leave.approve',
      'attendance.policy.manage',
      'attendance.report.read',
    ],
    events: [
      'attendance.department.created.v1',
      'attendance.employee.created.v1',
      'attendance.employee.updated.v1',
      'attendance.shift.created.v1',
      'attendance.shift.assigned.v1',
      'attendance.policy.created.v1',
      'attendance.policy.updated.v1',
      'attendance.holiday.created.v1',
      'attendance.employee.checked_in.v1',
      'attendance.employee.checked_out.v1',
      'attendance.leave.requested.v1',
      'attendance.leave.approved.v1',
      'attendance.leave.rejected.v1',
      'attendance.day.reconciled.v1',
    ],
    aiTools: [],
    navigation: { label: 'Attendance', href: '/attendance' },
  },
];

@Injectable()
export class ExtensionRegistryService {
  constructor(private readonly entitlements: EntitlementsService) {}

  manifests() {
    return MANIFESTS;
  }

  async listForTenant(principal: Principal) {
    const enabled = new Set(
      (await this.entitlements.list(principal.organizationId))
        .filter((item) => item.enabled)
        .map((item) => item.key),
    );
    return MANIFESTS.map((manifest) => ({
      ...manifest,
      enabled: principal.isPlatformAdmin || enabled.has(manifest.entitlement),
    }));
  }
}
