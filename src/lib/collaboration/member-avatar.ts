import type PocketBase from 'pocketbase';
import type { User } from '$lib/shell/types';
import type { TripMember } from './types';

// A trip_member loaded with `expand: 'user'`. Placeholders have no user, so
// `expand.user` is absent.
type MemberWithUser = TripMember & { expand?: { user?: User } };

// A trip_member carrying its resolved avatar URL ('' = initials fallback). The
// display fan-out (#106) attaches this in loaders so components can pass `img=`
// without needing `pb`. Optional so a plain `TripMember[]` stays assignable.
export type MemberWithAvatar = TripMember & { avatarUrl?: string };

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

/**
 * Attach a resolved `avatarUrl` to each member for the display fan-out (#106).
 * Callers must load the members with `expand: 'user'`; placeholders / no-avatar
 * members get '' and render the initials chip. Thin wrapper over
 * `memberAvatarUrl` so every surface resolves avatars identically.
 */
export function withAvatarUrls<T extends MemberWithUser>(
	pb: PocketBase,
	members: T[]
): Array<T & { avatarUrl: string }> {
	return members.map((m) => ({ ...m, avatarUrl: memberAvatarUrl(pb, m) }));
}
