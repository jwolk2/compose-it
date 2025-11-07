<script lang="ts">
	import GridCanvas from '$lib/components/GridCanvas.svelte';
	import { composerStore } from '$lib/state/composerStore';
	import { METERS, SCALES, TEMPOS } from '$lib/constants/music';
	import { TICKS_PER_BEAT, type ComposerState, type TempoId } from '$lib/types/composer';
	import type { PlacementActionResult } from '$lib/state/composerStore';
	import { browser } from '$app/environment';
	import { exportGridPdf, exportNotationPdf } from '$lib/utils/exporters';
	import { downloadBlob, downloadJson } from '$lib/utils/download';
	import { createProgressLoop } from '$lib/utils/progressLoop';
	import type { ProgressSnapshot } from '$lib/audio/player';
	import { onDestroy, onMount } from 'svelte';

	const slugify = (value: string) =>
		(
			value
				?.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '') || 'compose-it'
		).slice(0, 64);

	const baseFilename = () => slugify(composer?.compositionName || 'compose-it');

	let composer: ComposerState;
	const unsubscribe = composerStore.subscribe((value) => (composer = value));
	const progressLoop = createProgressLoop<ProgressSnapshot>();

	onDestroy(() => {
		unsubscribe();
		progressLoop.stop();
	});

	let statusMessage = '';
	let errorMessage = '';
	let isSaveDialogOpen = false;
	let dialogMode: 'save' | 'export' = 'export';
	let requestingName = '';
	let nameError = '';
	let exporting = false;
	let gridApi: { capture: () => string | null } | null = null;
	let isPlaying = false;
	let playheadSeconds = 0;
	let audioPlayer: typeof import('$lib/audio/player') | null = null;
	let motifMode = false;
	let backgroundInput: HTMLInputElement;
	let jsonInput: HTMLInputElement;
	let tempoOption = TEMPOS[1];
	$: tempoOption = TEMPOS.find((entry) => entry.id === composer?.tempo) ?? TEMPOS[1];

	let exportOptions = {
		grid: true,
		audio: true,
		json: true
	};

	onMount(async () => {
		if (!browser) return;
		audioPlayer = await import('$lib/audio/player');
	});

	const handlePlacementResult = (result: PlacementActionResult) => {
		if (result.ok) {
			statusMessage = 'Placement applied';
			errorMessage = '';
		} else if (result.reason) {
			errorMessage = result.reason;
		}
	};

	const handlePlace = (event: CustomEvent<{ definitionId: string; startTick: number; rowIndex: number; durationTicks: number }>) => {
		const result = composerStore.placeNote(event.detail.definitionId, {
			rowIndex: event.detail.rowIndex,
			startTick: event.detail.startTick,
			durationTicks: event.detail.durationTicks
		});
		handlePlacementResult(result);
	};

	const handleMove = (event: CustomEvent<{ noteId: string; startTick: number; rowIndex: number; durationTicks: number }>) => {
		const result = composerStore.moveNote(event.detail.noteId, {
			rowIndex: event.detail.rowIndex,
			startTick: event.detail.startTick,
			durationTicks: event.detail.durationTicks
		});
		handlePlacementResult(result);
	};

	const handleDelete = (event: CustomEvent<{ noteId: string }>) => {
		composerStore.removeNote(event.detail.noteId);
		statusMessage = 'Note removed';
	};

	const handlePlaceMotif = (event: CustomEvent<{ motifId: string; startTick: number; rowIndex: number }>) => {
		const result = composerStore.placeMotif(event.detail.motifId, event.detail.startTick, event.detail.rowIndex);
		handlePlacementResult(result);
	};

	const handleMotifSelection = (event: CustomEvent<{ noteIds: string[] }>) => {
		const defaultName = `Motif ${composer.motifs.length + 1}`;
		const name = window.prompt('Name motif', defaultName);
		if (!name) return;
		const motif = composerStore.createMotifFromNotes(event.detail.noteIds, name.trim());
		if (motif) {
			statusMessage = `Motif "${motif.name}" saved`;
			motifMode = false;
		}
	};

	const handleReady = (event: CustomEvent<{ capture: () => string | null }>) => {
		gridApi = event.detail;
	};

	const handlePlay = async () => {
		if (!audioPlayer || !composer.notes.length) return;
		await handleRestart();
		const { duration, started } = await audioPlayer.play(composer);
		if (!duration) return;
		isPlaying = true;
		await progressLoop.start({
			started,
			sample: () =>
				audioPlayer ? audioPlayer.getProgress(duration) : { ratio: 0, elapsedSeconds: 0 },
			onUpdate: (snapshot) => {
				playheadSeconds = snapshot.elapsedSeconds;
				if (snapshot.ratio >= 0.999) {
					isPlaying = false;
					playheadSeconds = 0;
					audioPlayer?.stop();
					progressLoop.stop();
				}
			}
		});
	};

	const handleRestart = async () => {
		if (!audioPlayer) return;
		await audioPlayer.stop();
		progressLoop.stop();
		isPlaying = false;
		playheadSeconds = 0;
	};

	const handleClear = async () => {
		if (confirm('Clear grid?')) {
			await handleRestart();
			composerStore.clear();
			statusMessage = 'Grid cleared';
		}
	};

	const handleTempoChange = (event: Event) => {
		const tempo = (event.target as HTMLSelectElement).value as TempoId;
		composerStore.setTempo(tempo);
	};

	const handleNameChange = (event: Event) => {
		composerStore.setCompositionName((event.target as HTMLInputElement).value);
	};

	const toggleSaveDialog = () => {
		isSaveDialogOpen = !isSaveDialogOpen;
	};

	const toggleMotifMode = () => {
		motifMode = !motifMode;
		statusMessage = motifMode ? 'Motif selection enabled — drag to capture a pattern.' : '';
	};

	const handleBackgroundFile = async (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		(event.target as HTMLInputElement).value = '';
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => composerStore.setBackgroundImage(reader.result as string);
		reader.readAsDataURL(file);
	};

	const handleJsonUpload = async (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		(event.target as HTMLInputElement).value = '';
		if (!file) return;
		const text = await file.text();
		try {
			composerStore.importState(JSON.parse(text));
			statusMessage = 'Composition loaded';
		} catch (error) {
			errorMessage = 'Invalid JSON file';
			console.error(error);
		}
	};

	const removeMotif = (motifId: string) => composerStore.removeMotif(motifId);

	const openDialog = (mode: 'save' | 'export') => {
		dialogMode = mode;
		requestingName = '';
		nameError = '';
		errorMessage = '';
		isSaveDialogOpen = true;
		if (mode === 'save') {
			exportOptions = { grid: false, audio: false, json: true };
		} else {
			exportOptions = { grid: true, audio: false, json: true };
		}
	};

	const handleExport = async () => {
		if (!requestingName.trim()) {
			nameError = 'Please provide a file name.';
			return;
		}
		nameError = '';
		errorMessage = '';
		exporting = true;
		const safeName = slugify(requestingName.trim());

		if (exportOptions.grid) {
			const image = gridApi?.capture();
			if (image) {
				exportGridPdf(image, composer);
			} else {
				errorMessage = 'Canvas not ready yet';
			}
		}

		if (exportOptions.audio && audioPlayer) {
			const blob = await audioPlayer.recordWav(composer);
			if (blob) downloadBlob(blob, `${safeName}.wav`);
		}

		if (exportOptions.json) {
			downloadJson(composer, `${safeName}.json`);
		}

		exporting = false;
		isSaveDialogOpen = false;
		statusMessage = dialogMode === 'save' ? 'Composition saved locally' : 'Export complete';
	};

	const lastSaved = () => new Date(composer.updatedAt).toLocaleTimeString();
</script>

<section class="workspace">
	<header class="workspace__top glass-panel">
		<div class="workspace__title">
			<input type="text" value={composer.compositionName} on:input={handleNameChange} placeholder="Composition name" />
			<p>{METERS[composer.meter].label} · {SCALES[composer.scaleId].label}</p>
		</div>
		<div class="workspace__actions">
			<button class="primary" on:click={handlePlay} disabled={!composer.notes.length}>
				{isPlaying ? '⏸ Pause' : '▶️ Play'}
			</button>
			<button class="ghost" on:click={handleRestart}>🔁 Restart</button>
			<button class="ghost" on:click={handleClear}>🧹 Clear</button>
			<label class="tempo">
				<span>⏱ Tempo</span>
				<select value={composer.tempo} on:change={handleTempoChange}>
					{#each TEMPOS as tempo}
						<option value={tempo.id}>{tempo.label}</option>
					{/each}
				</select>
			</label>
			<button class="ghost" on:click={() => openDialog('save')}>💾 Save</button>
			<button class="ghost" on:click={() => openDialog('export')}>📤 Export</button>
		</div>
	</header>

	<div class="workspace__utility">
		<div class="utility-buttons glass-panel">
			<button class:active={motifMode} on:click={toggleMotifMode}>🎼 Motif Mode</button>
			<button on:click={() => backgroundInput?.click()}>🖼 Background</button>
			<button on:click={() => jsonInput?.click()}>📁 Load JSON</button>
			<span class="autosave">Autosaved {lastSaved()}</span>
			<input bind:this={backgroundInput} type="file" accept="image/jpeg,image/png" on:change={handleBackgroundFile} hidden />
			<input bind:this={jsonInput} type="file" accept="application/json" on:change={handleJsonUpload} hidden />
		</div>
		<div class="status-stack">
			{#if statusMessage}
				<div class="status status--success">{statusMessage}</div>
			{/if}
			{#if errorMessage}
				<div class="status status--error">{errorMessage}</div>
			{/if}
		</div>
	</div>

	<div class="grid-wrapper glass-panel">
		<GridCanvas
			notes={composer.notes}
			meter={composer.meter}
			scale={composer.scaleId}
			motifs={composer.motifs}
			motifMode={motifMode}
			backgroundImage={composer.backgroundImage}
			playheadSeconds={playheadSeconds}
			bpm={tempoOption.bpm}
		on:place={handlePlace}
			on:move={handleMove}
			on:delete={handleDelete}
			on:placeMotif={handlePlaceMotif}
			on:motifSelection={handleMotifSelection}
			on:ready={handleReady}
		/>
	</div>

	<section class="motifs glass-panel">
		<div class="motifs__header">
			<h3>Motif Library</h3>
			<p>{composer.motifs.length ? 'Drag motifs from the palette or re-order them here.' : 'Activate motif mode and drag to capture a reusable pattern.'}</p>
		</div>
		{#if composer.motifs.length === 0}
			<div class="motifs__empty">No motifs yet.</div>
		{:else}
			<ul>
				{#each composer.motifs as motif}
					<li>
						<div>
							<strong>{motif.name}</strong>
							<span>{motif.notes.length} notes · {Math.round((motif.widthTicks / TICKS_PER_BEAT) * 10) / 10} beats</span>
						</div>
						<button on:click={() => removeMotif(motif.id)}>Remove</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if isSaveDialogOpen}
		<div class="modal-backdrop">
			<form class="dialog glass-panel" on:submit|preventDefault={handleExport}>
				<h3>Export your sequence</h3>
				<p>
					{dialogMode === 'save'
						? 'Name your composition to save a JSON snapshot.'
						: 'Choose which assets to export and provide a base filename.'}
				</p>
				<label class="filename">
					<span>File name</span>
					<input type="text" bind:value={requestingName} placeholder="Enter file name" required />
				</label>
				{#if nameError}
					<p class="error-text">{nameError}</p>
				{/if}
				{#if dialogMode === 'export'}
					<label><input type="checkbox" bind:checked={exportOptions.grid} /> Grid PDF</label>
					<label><input type="checkbox" bind:checked={exportOptions.audio} /> WAV audio render</label>
					<label><input type="checkbox" bind:checked={exportOptions.json} /> JSON project file</label>
				{:else}
					<p class="note">JSON project file will be saved.</p>
				{/if}
				<div class="dialog-actions">
					<button class="primary" type="submit" disabled={exporting}>{exporting ? 'Exporting…' : 'Export all'}</button>
					<button class="ghost" type="button" on:click={() => (isSaveDialogOpen = false)}>Cancel</button>
				</div>
			</form>
		</div>
	{/if}
</section>

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.workspace__top {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.5rem;
		background: var(--surface);
	}

	.workspace__title {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.workspace__title p {
		margin: 0;
		color: var(--muted);
	}

	.workspace__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}

	.workspace__actions button {
		padding: 0.6rem 1.2rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.05);
		color: inherit;
		cursor: pointer;
		transition: transform 0.15s ease, opacity 0.15s ease;
	}

	.workspace__actions button:hover {
		transform: translateY(-1px);
	}

	.workspace__utility {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: flex-start;
	}

	.utility-buttons {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 1rem;
		align-items: center;
	}

	.utility-buttons button {
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.06);
		padding: 0.45rem 0.9rem;
		color: inherit;
		cursor: pointer;
	}

	.utility-buttons button.active {
		background: var(--accent);
		color: #0b0f23;
	}

	.status-stack {
		min-width: 220px;
		flex: 1;
		color: var(--muted);
	}

	.status {
		padding: 0.75rem 1rem;
		border-radius: 16px;
		margin-bottom: 0.5rem;
	}

	.status--success {
		background: rgba(46, 204, 113, 0.1);
		border: 1px solid rgba(46, 204, 113, 0.4);
	}

	.status--error {
		background: rgba(255, 107, 129, 0.12);
		border: 1px solid rgba(255, 107, 129, 0.4);
	}

	.grid-wrapper {
		padding: 1rem;
	}

	.motifs {
		padding: 1.5rem;
		background: var(--surface);
		border-radius: 24px;
	}

	.motifs__header h3 {
		margin: 0;
	}

	.motifs__header p {
		margin: 0.25rem 0 1rem;
		color: var(--muted);
	}

	.motifs ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	.motifs li {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
		padding: 0.85rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.motifs li button {
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: transparent;
		color: inherit;
		border-radius: 999px;
		padding: 0.35rem 0.9rem;
		cursor: pointer;
	}

	.motifs__empty {
		padding: 1rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.04);
		color: var(--muted);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 6, 20, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(10px);
		z-index: 30;
	}

	.dialog {
		max-width: 460px;
		width: min(90vw, 480px);
		padding: 2rem;
		background: var(--surface-strong);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.dialog label {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.dialog label.filename {
		flex-direction: column;
		align-items: flex-start;
	}

	.dialog label.filename input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
		color: inherit;
	}

	.error-text {
		color: #ff6b81;
		margin: 0;
		font-size: 0.85rem;
	}

	.note {
		margin: 0.5rem 0 0;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.dialog-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.autosave {
		color: var(--muted);
	}
</style>
