import type { LayoutServerLoad } from './$types';
import type { Phase, Day, Notification, Item } from '$lib/types';
import type { Document } from '$lib/documents/types';
import { isTripActive } from '$lib/trip-mode/activation';
import { buildOfflineManifest } from '$lib/offline/offline-manifest';
import { loadTripAccess } from '$lib/server/trip-access';

export const load: LayoutServerLoad = async ({ params, locals, depends }) => {
	// #297: register a custom dependency so the NotificationBell can force a
	// reload of `notifications`/`unreadCount` (re-fetching the persisted
	// read_at) after a mark-read, even when navigating between sibling pages
	// that share this layout (which would NOT otherwise re-run this load).
	depends('app:notifications');

	// 404 unknown trip / 403 not an active member (#543 trip-access).
	const { trip, membership } = await loadTripAccess(locals.pb, params.slug, locals.user?.id);

	// Parking Lot is phase-scoped (glossary) — no trip-wide unplanned query here.
	// The ContextRail "Ideas" list reads the day page's phase-scoped parkingLotItems
	// via merged page data (#159); this loader can't see dayId anyway.
	const [phases, days, notifications] = await Promise.all([
		locals.pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb
			.collection('notifications')
			.getFullList<Notification>({
				filter: `recipient = "${membership.id}"`,
				// #390: newest first. PB ids are random, so `-id` never was; `created`
				// exists since 0069 (pre-0069 rows are blank and sort last).
				sort: '-created,-id',
				perPage: 30
			})
			.catch(() => [] as Notification[])
	]);

	const unreadCount = notifications.filter((n) => !n.read_at).length;

	// Whole-trip offline prefetch manifest (#254). ONLY for the active trip
	// (story 16: inactive/future trips aren't bulk-prefetched), so the two id-only
	// queries are skipped entirely otherwise. The client posts this URL list to
	// the SW on app-open during the active window; the SW best-effort caches it so
	// the whole trip (every day/item/overview + Documents list + bytes) is offline.
	let offlinePrefetchUrls: string[] = [];
	if (isTripActive(trip)) {
		const [items, documents] = await Promise.all([
			locals.pb.collection('items').getFullList<Item>({
				filter: `trip = "${trip.id}"`,
				fields: 'id'
			}),
			locals.pb.collection('documents').getFullList<Document>({
				filter: `trip = "${trip.id}"`,
				fields: 'id'
			})
		]);
		offlinePrefetchUrls = buildOfflineManifest({
			trip: { slug: trip.slug },
			days: days.map((d) => ({ id: d.id })),
			items: items.map((i) => ({ id: i.id })),
			documents: documents.map((doc) => ({ id: doc.id }))
		});
	}

	return { trip, membership, phases, days, notifications, unreadCount, offlinePrefetchUrls };
};
