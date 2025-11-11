<script lang="ts">
import GridCanvas from '$lib/components/GridCanvas.svelte';
import { composerStore } from '$lib/state/composerStore';
import { METERS, NOTE_PALETTE, SCALES, TEMPOS } from '$lib/constants/music';
import {
	TICKS_PER_BEAT,
	type ComposerState,
	type Motif,
	type NoteDefinition,
	type TempoId
} from '$lib/types/composer';
import type { PlacementActionResult } from '$lib/state/composerStore';
import { browser } from '$app/environment';
import { exportGridPdf, exportNotationPdf } from '$lib/utils/exporters';
import { downloadBlob, downloadJson } from '$lib/utils/download';
import { createProgressLoop } from '$lib/utils/progressLoop';
import type { ProgressSnapshot } from '$lib/audio/player';
import { onDestroy, onMount, createEventDispatcher } from 'svelte';


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

	const dispatch = createEventDispatcher<{ exit: void }>();

	const paletteOptions = [...NOTE_PALETTE].sort((a, b) => b.durationBeats - a.durationBeats);
// PNG icons generated locally via scripts/generate_note_icons.py (public-domain assets).
const RHYTHM_ICON_SOURCES: Record<string, string> = {
	whole: '/icons/notes/whole.png',
	half: '/icons/notes/half.png',
	'dotted-half': '/icons/notes/dotted-half.png',
	quarter: '/icons/notes/quarter.png',
	'dotted-quarter': '/icons/notes/dotted-quarter.png',
	eighth: '/icons/notes/eighth.png',
	'dotted-eighth': '/icons/notes/dotted-eighth.png',
	'triplet-eighth': '/icons/notes/triplet-eighth.png',
	sixteenth: '/icons/notes/sixteenth.png'
} as const;

	let sidebarCollapsed = false;
const defaultDefinition = paletteOptions[0] ?? null;
let selectedNoteId: string | null = defaultDefinition?.id ?? null;
let selectedMotifId: string | null = null;
let noteSelectionPayload: { definitionId: string; durationTicks: number; color: number } | null = defaultDefinition
	? {
			definitionId: defaultDefinition.id,
			durationTicks: defaultDefinition.durationTicks,
			color: defaultDefinition.color
	  }
	: null;

const NOTE_DRAG_TYPE = 'application/x-compose-note';
const MOTIF_DRAG_TYPE = 'application/x-compose-motif';

type SidebarDropRequest =
	| { type: 'note'; payload: { definitionId: string; durationTicks: number; color: number } }
	| { type: 'motif'; payload: { motifId: string; durationTicks: number; rowSpan: number } };

type ActiveSidebarDrag = {
	request: SidebarDropRequest;
	dragImageEl?: HTMLElement;
};

const beatsLabel = (beats: number) => {
		if (Number.isInteger(beats)) {
			return `${beats} beat${beats === 1 ? '' : 's'}`;
		}
		return `${parseFloat(beats.toFixed(2)).toString()} beats`;
	};

const getLocalNoteIcon = (id: string) => `/icons/notes/${id}.png`;

const isNoteDisabled = (definition: NoteDefinition) =>
	!!definition.restrictTo && !definition.restrictTo.includes(composer?.meter ?? '4/4');

	const createDragImage = (label: string) => {
		const el = document.createElement('div');
		el.textContent = label;
		el.style.position = 'fixed';
		el.style.top = '-9999px';
		el.style.padding = '4px 10px';
		el.style.borderRadius = '999px';
		el.style.background = 'rgba(10, 14, 34, 0.95)';
		el.style.color = '#fff';
		el.style.fontSize = '12px';
		el.style.fontFamily = 'Inter, sans-serif';
		el.style.pointerEvents = 'none';
		document.body.appendChild(el);
		return el;
	};

	const cleanupDragImage = () => {
		if (activeSidebarDrag?.dragImageEl?.isConnected) {
			activeSidebarDrag.dragImageEl.remove();
		}
	};

	$: {
		const definition = selectedNoteId ? paletteOptions.find((option) => option.id === selectedNoteId) ?? null : null;
		noteSelectionPayload = definition
			? {
					definitionId: definition.id,
					durationTicks: definition.durationTicks,
					color: definition.color
			  }
			: null;
		if (definition && isNoteDisabled(definition)) {
			selectedNoteId = null;
		}
	}

	$: if (selectedMotifId && !composer?.motifs.some((motif) => motif.id === selectedMotifId)) {
		selectedMotifId = null;
	}

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

	const handleTripletMemberMove = (event: CustomEvent<{ noteId: string; rowIndex: number }>) => {
		const target = composer.notes.find((note) => note.id === event.detail.noteId);
		if (!target) return;
		const result = composerStore.moveNote(event.detail.noteId, {
			rowIndex: event.detail.rowIndex,
			startTick: target.startTick,
			durationTicks: target.durationTicks
		});
		handlePlacementResult(result);
	};

	const handleTripletGroupMove = (event: CustomEvent<{ groupId: string; startTick: number }>) => {
		const result = composerStore.moveTripletGroup(event.detail.groupId, event.detail.startTick);
		handlePlacementResult(result);
	};

	const handleTripletGroupDelete = (event: CustomEvent<{ groupId: string }>) => {
		composerStore.removeTripletGroup(event.detail.groupId);
		statusMessage = 'Triplet removed';
	};

	const handleNoteOptionSelect = (definitionId: string) => {
		selectedMotifId = null;
		selectedNoteId = selectedNoteId === definitionId ? null : definitionId;
	};

	const handleNoteDragStart = (option: NoteDefinition, event: DragEvent) => {
		if (isNoteDisabled(option)) {
			event.preventDefault();
			return;
		}
		const dragImageEl = createDragImage(option.label);
		event.dataTransfer?.setDragImage(dragImageEl, dragImageEl.offsetWidth / 2, dragImageEl.offsetHeight / 2);
		activeSidebarDrag = {
			request: {
				type: 'note',
				payload: {
					definitionId: option.id,
					durationTicks: option.durationTicks,
					color: option.color
				}
			},
			dragImageEl
		};
		event.dataTransfer?.setData(NOTE_DRAG_TYPE, JSON.stringify(activeSidebarDrag.request.payload));
		event.dataTransfer?.setData('text/plain', option.label);
		event.dataTransfer && (event.dataTransfer.effectAllowed = 'copy');
		selectedMotifId = null;
		selectedNoteId = option.id;
	};

	const handleMotifDragStart = (motif: Motif, event: DragEvent) => {
		const dragImageEl = createDragImage(motif.name);
		event.dataTransfer?.setDragImage(dragImageEl, dragImageEl.offsetWidth / 2, dragImageEl.offsetHeight / 2);
		activeSidebarDrag = {
			request: {
				type: 'motif',
				payload: {
					motifId: motif.id,
					durationTicks: motif.widthTicks,
					rowSpan: motif.rowSpan
				}
			},
			dragImageEl
		};
		event.dataTransfer?.setData(MOTIF_DRAG_TYPE, JSON.stringify(activeSidebarDrag.request.payload));
		event.dataTransfer?.setData('text/plain', motif.name);
		event.dataTransfer && (event.dataTransfer.effectAllowed = 'copy');
		selectedNoteId = null;
		selectedMotifId = motif.id;
	};

	const handleSidebarDragEnd = () => {
		cleanupDragImage();
		activeSidebarDrag = null;
		gridCanvasRef?.clearSidebarPreview?.();
	};

	const handleMotifSelect = (motifId: string) => {
		selectedNoteId = null;
		selectedMotifId = selectedMotifId === motifId ? null : motifId;
	};

	const toggleSidebar = () => {
		sidebarCollapsed = !sidebarCollapsed;
	};

let gridCanvasRef: any = null;
let activeSidebarDrag: ActiveSidebarDrag | null = null;

	const dragContainsSupportedType = (event?: DragEvent) => {
		if (activeSidebarDrag) return true;
		const types = event?.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [];
		return types.includes(NOTE_DRAG_TYPE) || types.includes(MOTIF_DRAG_TYPE);
	};

	const extractRequestFromEvent = (event: DragEvent): SidebarDropRequest | null => {
		if (activeSidebarDrag?.request) return activeSidebarDrag.request;
		if (!event.dataTransfer) return null;
		const notePayload = event.dataTransfer.getData(NOTE_DRAG_TYPE);
		if (notePayload) {
			return { type: 'note', payload: JSON.parse(notePayload) };
		}
		const motifPayload = event.dataTransfer.getData(MOTIF_DRAG_TYPE);
		if (motifPayload) {
			return { type: 'motif', payload: JSON.parse(motifPayload) };
		}
		return null;
	};

	const handleGridDragOver = (event: DragEvent) => {
		if (!dragContainsSupportedType(event)) return;
		event.preventDefault();
		event.dataTransfer && (event.dataTransfer.dropEffect = 'copy');
		const request = extractRequestFromEvent(event);
		if (gridCanvasRef && request) {
			gridCanvasRef.previewSidebarDrop?.(request, { clientX: event.clientX, clientY: event.clientY });
		} else {
			gridCanvasRef?.clearSidebarPreview?.();
		}
	};

	const handleGridDrop = (event: DragEvent) => {
		if (!dragContainsSupportedType(event)) return;
		event.preventDefault();
		const request = extractRequestFromEvent(event);
		if (gridCanvasRef && request) {
			gridCanvasRef.handleSidebarDrop(request, { clientX: event.clientX, clientY: event.clientY });
		}
		gridCanvasRef?.clearSidebarPreview?.();
		cleanupDragImage();
		activeSidebarDrag = null;
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
		if (motifMode) {
			selectedNoteId = null;
			selectedMotifId = null;
		}
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
		requestingName = composer.compositionName.trim() || 'composition';
		nameError = '';
		errorMessage = '';
		if (mode === 'save') {
			exportOptions = { grid: false, audio: false, json: true };
		} else {
			exportOptions = { grid: true, audio: false, json: true };
		}
		isSaveDialogOpen = true;
	};

	const handleExport = async () => {
		const defaultName = composer.compositionName.trim() || 'composition';
		const safeName = slugify(defaultName);
		nameError = '';
		errorMessage = '';
		exporting = true;

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

<section class="composer-shell">
	<aside class:collapsed={sidebarCollapsed} class="sidebar glass-panel">
	<div class="sidebar__toggle">
		<button type="button" aria-label={sidebarCollapsed ? 'Expand tool sidebar' : 'Collapse tool sidebar'} on:click={toggleSidebar}>
			{sidebarCollapsed ? '⮞' : '⮜'}
		</button>
		{#if !sidebarCollapsed}
				<div>
					<h4>Palette & motifs</h4>
					<p>Pick a block, then click the grid.</p>
				</div>
			{/if}
		</div>
	{#if !sidebarCollapsed}
		<div class="sidebar-exit-row">
			<button class="exit-button" on:click={() => dispatch('exit')}>← Exit</button>
		</div>
		<div class="sidebar__content">
				<section class="palette-section">
					<div class="palette-list">
						{#each paletteOptions as option}
							<button
								type="button"
								draggable={!isNoteDisabled(option)}
								on:dragstart={(event) => handleNoteDragStart(option, event)}
								on:dragend={handleSidebarDragEnd}
								class="note-card"
								class:active={selectedNoteId === option.id}
								disabled={isNoteDisabled(option)}
								on:click={() => handleNoteOptionSelect(option.id)}>
								<span class="note-glyph" aria-hidden="true">
									<img
										src={getLocalNoteIcon(option.id)}
										alt=""
										loading="lazy"
										on:error={(event) => {
											const target = event.currentTarget as HTMLImageElement;
											target.style.display = 'none';
											target.parentElement?.classList.add('missing');
										}}
									/>
								</span>
								<div>
									<strong>{option.label}</strong>
									<small>{beatsLabel(option.durationBeats)}</small>
								</div>
							</button>
						{/each}
					</div>
				</section>

				<section class="motif-section">
					<div class="motif-actions">
						<button type="button" class:active={motifMode} on:click={toggleMotifMode}>
							{motifMode ? 'Capturing…' : 'Capture motif'}
						</button>
					</div>
					{#if composer.motifs.length === 0}
						<p class="empty-hint">No motifs yet. Turn on capture mode to box-select notes.</p>
					{:else}
						<div class="motif-list">
							{#each composer.motifs as motif}
								<div
									role="button"
									tabindex="0"
									class="motif-card"
									class:active={selectedMotifId === motif.id}
									draggable
									on:dragstart={(event) => handleMotifDragStart(motif, event)}
									on:dragend={handleSidebarDragEnd}
									on:click={() => handleMotifSelect(motif.id)}
									on:keydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											handleMotifSelect(motif.id);
										}
									}}>
									<div class="details">
										<strong>{motif.name}</strong>
										<small>{motif.notes.length} notes · {Math.round((motif.widthTicks / TICKS_PER_BEAT) * 10) / 10} beats</small>
									</div>
									<button type="button" class="remove" aria-label="Remove motif" on:click|stopPropagation={() => removeMotif(motif.id)}>✕</button>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="sidebar-actions">
					<button type="button" on:click={() => backgroundInput?.click()}>🖼 Set background</button>
					<button type="button" on:click={() => jsonInput?.click()}>📁 Load JSON</button>
					<span class="autosave">Autosaved {lastSaved()}</span>
					<input bind:this={backgroundInput} type="file" accept="image/jpeg,image/png" on:change={handleBackgroundFile} hidden />
					<input bind:this={jsonInput} type="file" accept="application/json" on:change={handleJsonUpload} hidden />
				</section>
			</div>
		{/if}
	</aside>

	<div class="workspace-main">
		<header class="workspace-header glass-panel">
			<div class="title-block">
				<input type="text" value={composer.compositionName} on:input={handleNameChange} placeholder="Composition name" />
				<p>{METERS[composer.meter].label} · {SCALES[composer.scaleId].label}</p>
			</div>
			<div class="status-stack">
				{#if statusMessage}
					<span class="status status--success">{statusMessage}</span>
				{/if}
				{#if errorMessage}
					<span class="status status--error">{errorMessage}</span>
				{/if}
			</div>
		</header>

		<div
			class="grid-stage glass-panel"
			role="region"
			aria-label="Composition grid"
			on:dragover|preventDefault={handleGridDragOver}
			on:drop={handleGridDrop}>
			<GridCanvas
				bind:this={gridCanvasRef}
				notes={composer.notes}
				meter={composer.meter}
				scale={composer.scaleId}
				motifs={composer.motifs}
				motifMode={motifMode}
				backgroundImage={composer.backgroundImage}
				playheadSeconds={playheadSeconds}
				bpm={tempoOption.bpm}
				selectedNoteDefinition={noteSelectionPayload}
				selectedMotifId={selectedMotifId}
				on:place={handlePlace}
				on:move={handleMove}
				on:delete={handleDelete}
				on:moveTripletMember={handleTripletMemberMove}
				on:moveTripletGroup={handleTripletGroupMove}
				on:deleteTripletGroup={handleTripletGroupDelete}
				on:placeMotif={handlePlaceMotif}
				on:motifSelection={handleMotifSelection}
				on:ready={handleReady}
			/>
		</div>
	</div>
</section>

<footer class="control-dock glass-panel">
	<div class="dock-group">
		<button class="primary" on:click={handlePlay} disabled={!composer.notes.length}>
			{isPlaying ? '⏸ Pause' : '▶️ Play'}
		</button>
		<button on:click={handleRestart}>🔁 Restart</button>
		<button on:click={handleClear}>🧹 Clear</button>
	</div>
	<div class="dock-group">
		<label class="tempo">
			<span>⏱ Tempo</span>
			<select value={composer.tempo} on:change={handleTempoChange}>
				{#each TEMPOS as tempo}
					<option value={tempo.id}>{tempo.label}</option>
				{/each}
			</select>
		</label>
		<button on:click={() => openDialog('save')}>💾 Save</button>
		<button on:click={() => openDialog('export')}>📤 Export</button>
	</div>
</footer>

{#if isSaveDialogOpen}
	<div class="modal-backdrop">
		<form class="dialog glass-panel" on:submit|preventDefault={handleExport}>
			{#if dialogMode === 'save'}
				<h3>Save Composition</h3>
				<p>Would you like to save your composition <strong>{composer.compositionName || 'composition'}</strong>?</p>
			{:else}
				<h3>Export your sequence</h3>
				<p>Choose which assets to export.</p>
				<p class="note">Using file name <strong>{composer.compositionName || 'composition'}</strong>.</p>
				<label><input type="checkbox" bind:checked={exportOptions.grid} /> Grid PDF</label>
				<label><input type="checkbox" bind:checked={exportOptions.audio} /> WAV audio render</label>
				<label><input type="checkbox" bind:checked={exportOptions.json} /> JSON project file</label>
			{/if}
			<div class="dialog-actions">
				<button class="primary" type="submit" disabled={exporting}>{exporting ? 'Downloading…' : 'Download'}</button>
				<button class="ghost" type="button" on:click={() => (isSaveDialogOpen = false)}>Cancel</button>
			</div>
		</form>
	</div>
{/if}


<style>
	:global(:root) {
		--dock-height: 96px;
		--sidebar-width: 320px;
		--sidebar-collapsed-width: 72px;
	}

	.composer-shell {
		display: flex;
		gap: 1rem;
		min-height: calc(100vh - var(--dock-height));
		height: calc(100vh - var(--dock-height));
		overflow: hidden;
	}

	.sidebar {
		flex: 0 0 var(--sidebar-width);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: flex-basis 0.3s ease;
		overflow: hidden;
		max-height: calc(100vh - var(--dock-height));
		position: relative;
	}

	.sidebar.collapsed {
		flex: 0 0 var(--sidebar-collapsed-width);
		align-items: center;
	}

	.sidebar__toggle {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.sidebar__toggle button {
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.04);
		border-radius: 12px;
		color: inherit;
		padding: 0.25rem;
		cursor: pointer;
	}

	.sidebar__toggle h4 {
		margin: 0;
	}

	.sidebar__toggle p {
		margin: 0;
		color: var(--muted);
		font-size: 0.8rem;
	}

	.sidebar__content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
		padding: 0.5rem 0.5rem 0 0.5rem;
		scrollbar-width: thin;
		max-height: calc(100vh - var(--dock-height) - 80px);
		position: relative;
	}

	.sidebar.collapsed .sidebar__content {
		display: none;
	}

	.sidebar-exit-row {
		display: flex;
		justify-content: flex-start;
		margin-bottom: 0.75rem;
		padding-right: 0.5rem;
	}

	.palette-section {
		margin-top: 0.5rem;
	}

	.palette-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.note-card {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.9rem;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.02);
		color: inherit;
		cursor: pointer;
		transition: border-color 0.2s ease, transform 0.15s ease;
	}

	.note-card:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	.note-card:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.note-card.active {
		border-color: var(--accent);
		background: rgba(255, 209, 102, 0.08);
	}

	.note-card strong {
		display: block;
		font-size: 0.95rem;
	}

	.note-card small {
		color: var(--muted);
	}

	.note-glyph {
		width: 48px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.note-glyph img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	:global(.note-glyph.missing)::after {
		content: 'PNG';
		font-size: 0.8rem;
		color: var(--muted);
	}

	.motif-actions {
		display: flex;
		justify-content: flex-start;
	}

	.motif-section button {
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.05);
		color: inherit;
		padding: 0.3rem 0.85rem;
		cursor: pointer;
	}

	.motif-section button.active {
		background: var(--accent);
		color: #0b0f23;
	}

	.motif-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.motif-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.8rem;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.02);
		cursor: pointer;
	}

	.motif-card.active {
		border-color: var(--accent-2);
		background: rgba(138, 180, 255, 0.07);
	}

	.motif-card .details strong {
		display: block;
	}

	.motif-card .details small {
		color: var(--muted);
	}

	.motif-card .remove {
		border: none;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}

	.empty-hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.sidebar-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.sidebar-actions button {
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		text-align: left;
	}

	.autosave {
		color: var(--muted);
		font-size: 0.8rem;
	}

	.workspace-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow: hidden;
	}

	.exit-button {
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.05);
		color: inherit;
		padding: 0.35rem 0.9rem;
		border-radius: 999px;
		cursor: pointer;
	}

	.workspace-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.75rem 1.5rem 0.5rem;
	}

	.title-block {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.title-block p {
		margin: 0;
		color: var(--muted);
	}

	.status-stack {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 180px;
		align-items: flex-end;
	}

	.status {
		padding: 0.35rem 0.65rem;
		border-radius: 999px;
		font-size: 0.8rem;
	}

	.status--success {
		background: rgba(46, 204, 113, 0.15);
		border: 1px solid rgba(46, 204, 113, 0.4);
	}

	.status--error {
		background: rgba(255, 107, 129, 0.15);
		border: 1px solid rgba(255, 107, 129, 0.4);
	}

	.grid-stage {
		flex: 1;
		min-height: 0;
		padding: 0.5rem;
		overflow: hidden;
	}

	.control-dock {
		position: sticky;
		bottom: 0.75rem;
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		backdrop-filter: blur(16px);
	}

	.dock-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.control-dock button,
	.control-dock label {
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		padding: 0.4rem 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.control-dock .tempo select {
		background: transparent;
		border: none;
		color: inherit;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 6, 20, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
	}

	.dialog {
		max-width: 420px;
		width: 90%;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.dialog-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	@media (max-width: 1024px) {
		.composer-shell {
			flex-direction: column;
			min-height: unset;
		}

		.sidebar {
			width: 100%;
			flex-direction: column;
		}

		.sidebar.collapsed {
			width: 100%;
		}

		.workspace-main {
			min-height: calc(100vh - var(--dock-height));
		}
	}
</style>
