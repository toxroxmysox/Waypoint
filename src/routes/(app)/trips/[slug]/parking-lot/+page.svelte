<script lang="ts">
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import ParkingLotSection from '$lib/components/ParkingLotSection.svelte';

	let { data } = $props();
</script>

<NavBar
	title="Parking Lot"
	subtitle={data.trip.title}
	back
	backHref="/trips/{data.trip.slug}/more"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	<ParkingLotSection
		items={data.parkingLotItems}
		phases={data.phases}
		tripSlug={data.trip.slug}
	/>
</main>
