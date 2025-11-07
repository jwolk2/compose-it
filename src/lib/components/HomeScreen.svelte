<script lang="ts">
	import type { MeterDefinition, MeterId } from '$lib/types/composer';
	import { createEventDispatcher } from 'svelte';

	export let meters: MeterDefinition[] = [];

	const dispatch = createEventDispatcher<{ select: { meter: MeterId } }>();

	const copy = [
		'Choose a pulse to define the rhythmic grid.',
		'Compose across four glowing measures or tighten to three.'
	];
</script>

<section class="home glass-panel">
	<div class="hero">
		<p class="badge">AI Generated Composer</p>
		<h1>Compose-It</h1>
		<p class="lede">
			Shape motifs, paint rhythms, and export fully orchestrated sketches. Pick a time signature to
			set the stage.
		</p>
	</div>
	<div class="grid">
		{#each meters as meter, index}
			<button class="card" type="button" on:click={() => dispatch('select', { meter: meter.id })}>
				<div class="card-top">
					<h2>{meter.id}</h2>
					<span>{meter.label}</span>
				</div>
				<p>{copy[index % copy.length]}</p>
				<div class="meta">
					<strong>{meter.measures}</strong>
					<span>measures</span>
					<strong>{meter.totalBeats}</strong>
					<span>beats total</span>
				</div>
			</button>
		{/each}
	</div>
</section>

<style>
	.home {
		padding: clamp(2rem, 5vw, 3rem);
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
		background: var(--surface-strong);
	}

	.hero h1 {
		font-family: 'Space Grotesk', 'Inter', sans-serif;
		font-size: clamp(2.8rem, 12vw, 4.5rem);
		margin: 0.5rem 0;
	}

	.lede {
		font-size: 1.05rem;
		max-width: 640px;
		color: var(--muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1.5rem;
	}

	.card {
		border: none;
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
		border-radius: 20px;
		padding: 1.5rem;
		text-align: left;
		color: inherit;
		cursor: pointer;
		transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}

	.card:hover,
	.card:focus-visible {
		transform: translateY(-6px);
		border-color: rgba(255, 255, 255, 0.35);
		box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
	}

	.card-top h2 {
		margin: 0;
		font-size: 2.4rem;
	}

	.card-top span {
		display: block;
		color: var(--muted);
		margin-top: 0.2rem;
	}

	.meta {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem;
		align-items: baseline;
		margin-top: 1rem;
		font-size: 0.9rem;
	}

	.meta strong {
		font-size: 1.2rem;
	}
</style>
