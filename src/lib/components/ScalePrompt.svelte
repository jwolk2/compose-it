<script lang="ts">
	import type { ScaleDefinition, ScaleId } from '$lib/types/composer';
	import { createEventDispatcher } from 'svelte';

	export let open = false;
	export let scales: ScaleDefinition[] = [];

	const dispatch = createEventDispatcher<{ select: { scale: ScaleId } }>();
</script>

{#if open}
	<div class="backdrop" role="dialog" aria-modal="true">
		<div class="modal glass-panel">
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
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	button {
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		padding: 1rem 1.2rem;
		background: rgba(255, 255, 255, 0.04);
		text-align: left;
		color: inherit;
		cursor: pointer;
		transition: border-color 0.2s ease, transform 0.2s ease;
	}

	button:hover,
	button:focus-visible {
		border-color: var(--accent);
		transform: translateY(-2px);
	}

	button p {
		margin: 0.4rem 0 0;
		color: var(--muted);
	}
</style>
