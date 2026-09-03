import type { Party } from '@daml/types';

/**
 * `alice-d4d95138::1220ab…` -> `alice`. Canton appends a disambiguating suffix to the allocation
 * hint and a namespace fingerprint, neither of which is worth showing in the UI.
 */
export function partyLabel(party: Party): string {
	return party.split('::')[0].replace(/-[0-9a-f]{8}$/, '');
}
