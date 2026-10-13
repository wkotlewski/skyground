import registry from '../../data/provider-registry.json';

export interface ProviderRecord {
  id: string;
  name: string;
  licenseOrTerms: string;
  documentationUrl: string;
  execution: string;
  capability: string;
  enabled: boolean;
}

export const providers = registry.providers as ProviderRecord[];

export function providerEnabled(id: string): boolean {
  return providers.find((provider) => provider.id === id)?.enabled === true;
}
