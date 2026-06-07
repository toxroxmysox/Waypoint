import type { TripMember } from '$lib/types';

// Canonical display-name resolution for a trip member, used across the
// checklist/lists surfaces (issues #49/#50/#51). Mirrors the fallback chain
// the item detail page has used since #48.
export function memberDisplayName(member: TripMember | undefined | null): string {
	if (!member) return 'Unknown';
	return (
		member.display_name ||
		member.expand?.user?.name ||
		member.expand?.user?.email ||
		member.placeholder_name ||
		'Unknown'
	);
}

export function memberInitial(member: TripMember | undefined | null): string {
	return memberDisplayName(member).slice(0, 1).toUpperCase();
}
