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
