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
		<div class="logo-wrapper">
			<a
				class="logo-badge"
				href="https://nbsymphony.org/"
				target="_blank"
				rel="noreferrer"
				aria-label="Visit the New Bedford Symphony Orchestra website"
			>
				<img src="/nbso-logo.png" alt="New Bedford Symphony Orchestra" loading="lazy" />
			</a>
		</div>
		<h1><span>Compose-It</span></h1>
		<p class="lede">
			Compose-It is a graphic music composition program that allows young<br />(and new) composers to
			create music in a visual and intuitive way.
		</p>
	</div>
	<p class="subhead">Choose a meter to begin</p>
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
		background: linear-gradient(150deg, rgba(12, 24, 58, 0.98), rgba(8, 17, 45, 0.92)),
			radial-gradient(circle at 15% 15%, rgba(130, 197, 255, 0.22), transparent 45%),
			radial-gradient(circle at 80% 25%, rgba(94, 192, 255, 0.2), transparent 55%);
		position: relative;
		overflow: hidden;
	}

	.hero {
		position: relative;
		z-index: 1;
	}

	.logo-wrapper {
		position: absolute;
		top: clamp(0.5rem, 2.5vw, 1.25rem);
		right: clamp(1rem, 4vw, 2rem);
		z-index: 2;
	}

	.logo-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.82);
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 18px;
		padding: 0.65rem 1.05rem;
		box-shadow: 0 16px 38px rgba(0, 0, 0, 0.25);
		text-decoration: none;
	}

	.logo-badge img {
		height: clamp(100px, 14vw, 150px);
		width: auto;
		display: block;
	}

	.hero-decoration {
		position: absolute;
		inset: -20px;
		background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.08), transparent 60%),
			radial-gradient(circle at 60% 10%, rgba(255, 209, 102, 0.18), transparent 50%),
			radial-gradient(circle at 90% 30%, rgba(138, 180, 255, 0.2), transparent 40%);
		filter: blur(35px);
		z-index: -1;
		pointer-events: none;
		opacity: 0.8;
	}

	.home::after {
		content: '';
		position: absolute;
		inset: 6px;
		border-radius: 28px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		pointer-events: none;
	}

	.hero h1 {
		font-family: 'Space Grotesk', 'Inter', sans-serif;
		font-size: clamp(4.2rem, 14vw, 7rem);
		margin: 0.5rem 0;
	}

	.hero h1 span {
		display: inline-block;
		background: linear-gradient(120deg, #ffd166, #ff8ba7 40%, #8ab4ff 70%, #c8ffe0);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		color: transparent;
		text-shadow: 0 8px 25px rgba(0, 0, 0, 0.45);
	}

	.lede {
		font-size: 1.25rem;
		max-width: 640px;
		color: var(--muted);
		font-family: 'Fresca', 'Didot', 'Times New Roman', serif;
	}

	.subhead {
		text-align: center;
		margin: 0;
		margin-top: -0.5rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #e7ecfb;
		font-family: 'Didot', 'Times New Roman', serif;
		font-size: 1.25rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1.5rem;
	}

	.card {
		border: none;
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04))
				border-box,
			radial-gradient(circle at 20% 20%, rgba(198, 236, 255, 0.4), transparent 55%) border-box;
		border-radius: 20px;
		padding: 1rem 1.5rem 1.5rem;
		text-align: left;
		color: inherit;
		cursor: pointer;
		transition: transform 0.25s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
		border: 1px solid transparent;
		box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
		position: relative;
		overflow: hidden;
	}

	.card:hover,
	.card:focus-visible {
		transform: translateY(-10px);
		border-color: rgba(255, 255, 255, 0.55);
		background: linear-gradient(150deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05)),
			radial-gradient(circle at 20% 20%, rgba(255, 209, 102, 0.4), transparent 55%);
		box-shadow: 0 30px 65px rgba(0, 0, 0, 0.45);
	}

	.card::after {
		content: '';
		position: absolute;
		inset: 1px;
		border-radius: 19px;
		border: 1px solid rgba(255, 255, 255, 0.05);
		pointer-events: none;
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
		color: rgba(255, 255, 255, 0.8);
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
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 0.2rem;
	}

	.meta strong {
		font-size: 1.6rem;
		display: block;
	}
</style>
