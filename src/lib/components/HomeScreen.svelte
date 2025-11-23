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
		<div class="hero-decoration" aria-hidden="true"></div>
		<p class="badge">New Bedford Symphony Orchestra</p>
		<h1><span>Compose-It</span></h1>
		<p class="lede">
			Shape motifs, paint rhythms, and build complete compositions. Pick a time signature to set the
			stage.
		</p>
	</div>
	<div class="grid">
		{#each meters as meter, index}
			<button class={`card accent-${index % 3}`} type="button" on:click={() => dispatch('select', { meter: meter.id })}>
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
		background: linear-gradient(135deg, #f6f1ff 0%, #feeef7 45%, #e3f1ff 100%);
		position: relative;
		overflow: hidden;
		color: #1f2343;
	}

	.hero {
		position: relative;
		z-index: 1;
	}

	.hero-decoration {
		position: absolute;
		inset: -20px;
		background: radial-gradient(circle at 25% 15%, rgba(255, 255, 255, 0.85), transparent 55%),
			radial-gradient(circle at 70% 0%, rgba(255, 200, 162, 0.45), transparent 55%),
			radial-gradient(circle at 95% 35%, rgba(137, 191, 255, 0.35), transparent 45%);
		filter: blur(45px);
		z-index: -1;
		pointer-events: none;
		opacity: 0.85;
	}

	.home::after {
		content: '';
		position: absolute;
		inset: 6px;
		border-radius: 28px;
		border: 1px solid rgba(27, 31, 62, 0.1);
		box-shadow: inset 0 0 45px rgba(255, 255, 255, 0.4);
		pointer-events: none;
	}

	.hero h1 {
		font-family: 'Space Grotesk', 'Inter', sans-serif;
		font-size: clamp(2.8rem, 12vw, 4.5rem);
		margin: 0.5rem 0;
	}

	.hero h1 span {
		display: inline-block;
		background: linear-gradient(120deg, #ffb677, #ff89c2 35%, #8fb6ff 70%, #74f0c4);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		color: transparent;
		text-shadow: 0 10px 30px rgba(255, 137, 194, 0.5);
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
		border: 1px solid rgba(27, 31, 62, 0.22);
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.97), rgba(244, 241, 255, 0.92));
		border-radius: 26px;
		padding: 1rem 1.5rem 1.5rem;
		text-align: left;
		color: inherit;
		cursor: pointer;
		transition: transform 0.25s ease, box-shadow 0.2s ease, border-color 0.2s ease;
		box-shadow: 0 24px 42px rgba(27, 31, 62, 0.18);
		position: relative;
		overflow: hidden;
	}

	.card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: radial-gradient(circle at 20% 20%, rgba(255, 198, 156, 0.45), transparent 60%);
		opacity: 0.65;
		pointer-events: none;
	}

	.card::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		border: 1px solid rgba(27, 31, 62, 0.12);
		pointer-events: none;
	}

	.card:hover,
	.card:focus-visible {
		transform: translateY(-10px);
		border-color: rgba(27, 31, 62, 0.45);
		box-shadow: 0 32px 65px rgba(27, 31, 62, 0.25);
	}

	.card.accent-0::before {
		background: radial-gradient(circle at 20% 20%, rgba(255, 198, 156, 0.55), transparent 60%);
	}

	.card.accent-1::before {
		background: radial-gradient(circle at 20% 20%, rgba(154, 206, 255, 0.5), transparent 60%);
	}

	.card.accent-2::before {
		background: radial-gradient(circle at 20% 20%, rgba(198, 255, 217, 0.5), transparent 60%);
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
		color: rgba(31, 35, 67, 0.65);
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

	.meter-fraction span {
		color: #161a3a;
		text-shadow: 0 4px 12px rgba(255, 185, 140, 0.35);
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
		color: rgba(31, 35, 67, 0.7);
	}

	.card-divider {
		width: 100%;
		height: 1px;
		background: rgba(31, 35, 67, 0.08);
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
		color: rgba(31, 35, 67, 0.65);
		margin-bottom: 0.2rem;
	}

	.meta strong {
		font-size: 1.6rem;
		display: block;
	}
</style>
