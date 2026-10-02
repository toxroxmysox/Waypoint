<script lang="ts">
	// #375 / #381 — the banner a form action's `fail({ error, field? })` renders.
	// Owns the wiring every page used to copy: each new failure scrolls to and
	// focuses the control the action named (`form.field`), else the banner
	// itself (revealServerError). The effect reads `form` — a fresh object per
	// submit — so the same message twice in a row still re-reveals.
	// A page just renders <ServerErrorAlert {form} />.
	import { revealServerError, errorField } from '$lib/shell/actions/validate-form';

	let {
		form,
		class: klass = ''
	}: {
		form: unknown;
		class?: string;
	} = $props();

	const message = $derived.by(() => {
		const error = (form as { error?: unknown } | null | undefined)?.error;
		return typeof error === 'string' ? error : '';
	});

	let el = $state<HTMLElement | null>(null);
	$effect(() => {
		if (message) revealServerError(el, errorField(form));
	});
</script>

{#if message}
	<div bind:this={el} role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm {klass}">
		{message}
	</div>
{/if}
