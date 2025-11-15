<script lang="ts">
	import type { MeterDefinition, MeterId } from '$lib/types/composer';
	import { createEventDispatcher } from 'svelte';

export let meters: MeterDefinition[] = [];

const dispatch = createEventDispatcher<{ select: { meter: MeterId } }>();

const pulseNames: Record<number, string> = {
	2: 'two',
	3: 'three',
	4: 'four',
	5: 'five',
	6: 'six'
};

const pulsesLabel = (count: number) => pulseNames[count] ?? count.toString();

</script>

<section class="home glass-panel">
	<div class="hero">
		<p class="badge">New Bedford Symphony Orchestra</p>
		<h1>Compose-It</h1>
		<p class="lede">
			Shape motifs, paint rhythms, and build complete compositions. Pick a time signature to set the
			stage.
		</p>
	</div>
	<div class="grid">
		{#each meters as meter}
			<button class="card" type="button" on:click={() => dispatch('select', { meter: meter.id })}>
				<div class="card-top">
					<h2 class="meter-mark" aria-label={`${meter.id} time`}>
						<span class="meter-fraction" aria-hidden="true">
							<span>{meter.id.split('/')[0]}</span>
							<span>{meter.id.split('/')[1]}</span>
						</span>
						<span class="meter-label">Time</span>
					</h2>
					<div class="card-divider" aria-hidden="true"></div>
					<span><em>Groupings of {pulsesLabel(meter.beatsPerMeasure)} pulses</em></span>
				</div>
				<div class="meta">
					<div>
						<small>Measures</small>
						<strong>{meter.measures}</strong>
					</div>
					<div>
						<small>Beats per measure</small>
						<strong>{meter.beatsPerMeasure}</strong>
					</div>
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
		padding: 1rem 1.5rem 1.5rem;
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

	.card-top {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.card-top h2 {
		margin: 0;
		font-size: 2.3rem;
		display: flex;
		align-items: center;
		gap: 0.85rem;
		font-weight: 600;
	}

	.card-top span {
		display: block;
		color: var(--muted);
		margin-top: 0.4rem;
	}

	.meter-mark {
		display: inline-flex;
		align-items: center;
		gap: 0.8rem;
	}

	.meter-fraction {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.1;
		font-size: 2.2rem;
		font-weight: 600;
		min-width: 48px;
		text-align: center;
	}

	.meter-fraction span:first-child {
		margin-bottom: 0.1rem;
	}

	.meter-fraction span:last-child {
		margin-top: 0.1rem;
	}

	.meter-label {
		font-size: 1rem;
		letter-spacing: 0.08em;
		text-transform: capitalize;
	}

	.card-divider {
		width: 100%;
		height: 1px;
		background: rgba(255, 255, 255, 0.12);
		margin: 0.35rem 0 0.15rem;
		border-radius: 999px;
	}

	.meta {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		margin-top: 1.25rem;
	}

	.meta small {
		display: block;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.7rem;
		color: var(--muted);
		margin-bottom: 0.2rem;
	}

	.meta strong {
		font-size: 1.6rem;
		display: block;
	}
</style>
