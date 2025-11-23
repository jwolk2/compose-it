<script lang="ts">
	import type { ScaleDefinition, ScaleId } from '$lib/types/composer';
	import { createEventDispatcher } from 'svelte';

	export let open = false;
	export let scales: ScaleDefinition[] = [];

	const dispatch = createEventDispatcher<{ select: { scale: ScaleId }; exit: void }>();
</script>

{#if open}
	<div class="backdrop" role="dialog" aria-modal="true">
		<div class="modal glass-panel">
			<button class="exit" type="button" on:click={() => dispatch('exit')}>
				<span aria-hidden="true">←</span>
				Exit
			</button>
			<p class="badge">Pick a palette</p>
			<h2>Choose the scale</h2>
			<p class="lede">Select the pitch collection that populates the vertical axis.</p>
			<div class="options">
				{#each scales as scale}
					<button type="button" on:click={() => dispatch('select', { scale: scale.id })}>
						<div>
							<strong>{scale.label}</strong>
							<p>{scale.description}</p>
						</div>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 6, 20, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(10px);
		z-index: 20;
	}

	.modal {
		max-width: 560px;
		width: min(90vw, 560px);
		padding: 2.25rem;
		position: relative;
	}

	.exit {
		position: absolute;
		right: 1.25rem;
		top: 1.25rem;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.22);
		color: inherit;
		border-radius: 999px;
		padding: 0.45rem 0.85rem;
		cursor: pointer;
		font-weight: 600;
		letter-spacing: 0.01em;
		transition: border-color 0.2s ease, transform 0.2s ease;
	}

	.exit:hover,
	.exit:focus-visible {
		border-color: var(--accent);
		transform: translateY(-1px);
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	button {
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 1rem 1.2rem;
		background: rgba(255, 255, 255, 0.06);
		text-align: left;
		color: inherit;
		cursor: pointer;
		transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08), 0 12px 28px rgba(0, 0, 0, 0.25);
	}

	button:hover,
	button:focus-visible {
		border-color: var(--accent);
		transform: translateY(-2px);
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.2), 0 14px 32px rgba(0, 0, 0, 0.32);
	}

	button p {
		margin: 0.4rem 0 0;
		color: var(--muted);
	}
</style>
