import type PocketBase from 'pocketbase';
import type { User } from '$lib/shell/types';
import type { TripMember } from './types';

// A trip_member loaded with `expand: 'user'`. Placeholders have no user, so
// `expand.user` is absent.
type MemberWithUser = TripMember & { expand?: { user?: User } };

/**
 * Resolve a trip member's avatar file URL from its expanded `user`.
 *
 * Returns '' when the member is a placeholder (no user) or the user has no
 * avatar — `Avatar.svelte` then renders its initials fallback. Loaders that
 * display members must query with `expand: 'user'` for this to resolve.
 *
 * Shared read path for #59 (PRD docs/AVATARS_PRD.md); the broad fan-out into
 * vote stacks / assignees / goals / comments is #106.
 */
export function memberAvatarUrl(pb: PocketBase, member: MemberWithUser): string {
	const user = member.expand?.user;
	if (!user || !user.avatar) return '';
	return pb.files.getURL(user, user.avatar);
}
