<script lang="ts">
	import HomeScreen from '$lib/components/HomeScreen.svelte';
	import ScalePrompt from '$lib/components/ScalePrompt.svelte';
	import ComposerWorkspace from '$lib/components/ComposerWorkspace.svelte';
	import { METERS, SCALES } from '$lib/constants/music';
	import type { MeterId, ScaleId } from '$lib/types/composer';
	import { composerStore } from '$lib/state/composerStore';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	type Stage = 'home' | 'composer';

	let stage: Stage = 'home';
	let pendingMeter: MeterId | null = null;
	let showScalePrompt = false;

	const handleMeterSelect = (event: CustomEvent<{ meter: MeterId }>) => {
		pendingMeter = event.detail.meter;
		showScalePrompt = true;
	};

	const handleScaleSelect = (event: CustomEvent<{ scale: ScaleId }>) => {
		if (!pendingMeter) return;
		composerStore.initializeSelection(pendingMeter, event.detail.scale);
		stage = 'composer';
		showScalePrompt = false;
	};

	const handleScaleExit = () => {
		pendingMeter = null;
		showScalePrompt = false;
		stage = 'home';
	};

	onMount(() => {
		if (!browser) return;
		const unsub = composerStore.subscribe((value) => {
			if (value.notes.length) {
				stage = 'composer';
			}
		});
		return () => unsub();
	});
</script>

<svelte:head>
	<title>Compose-It</title>
</svelte:head>

{#if stage === 'home'}
	<HomeScreen on:select={handleMeterSelect} meters={Object.values(METERS)} />
	<ScalePrompt
		open={showScalePrompt}
		scales={Object.values(SCALES)}
		on:select={handleScaleSelect}
		on:exit={handleScaleExit}
	/>
{:else}
	<ComposerWorkspace on:exit={() => (stage = 'home')} />
{/if}
