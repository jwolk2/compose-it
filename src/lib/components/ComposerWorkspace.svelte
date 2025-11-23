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
		if (statusTimer) clearTimeout(statusTimer);
		if (errorTimer) clearTimeout(errorTimer);
	});

	let statusMessage = '';
	let errorMessage = '';
	const STATUS_TIMEOUT_MS = 4000;
	const ERROR_TIMEOUT_MS = 4000;
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	let errorTimer: ReturnType<typeof setTimeout> | null = null;

	const setStatus = (message: string, { persist = false }: { persist?: boolean } = {}) => {
		if (statusTimer) {
			clearTimeout(statusTimer);
			statusTimer = null;
		}
		statusMessage = message;
		if (message && !persist) {
			const snapshot = message;
			statusTimer = setTimeout(() => {
				if (statusMessage === snapshot) statusMessage = '';
				statusTimer = null;
			}, STATUS_TIMEOUT_MS);
		}
	};

	const setError = (message: string) => {
		if (errorTimer) {
			clearTimeout(errorTimer);
			errorTimer = null;
		}
		errorMessage = message;
		if (message) {
			const snapshot = message;
			errorTimer = setTimeout(() => {
				if (errorMessage === snapshot) errorMessage = '';
				errorTimer = null;
			}, ERROR_TIMEOUT_MS);
		}
	};
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
const colorToHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
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
let selectedNoteIds: string[] = [];
let multiSelectEnabled = false;

const NOTE_DRAG_TYPE = 'application/x-compose-note';
const MOTIF_DRAG_TYPE = 'application/x-compose-motif';

type SidebarDropRequest =
	| { type: 'note'; payload: { definitionId: string; durationTicks: number; color: number } }
	| { type: 'motif'; payload: { motifId: string; durationTicks: number; rowSpan: number } };

type ActiveSidebarDrag = {
	request: SidebarDropRequest;
	dragImageEl?: HTMLElement;
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
			setStatus('Placement applied');
			setError('');
		} else if (result.reason) {
			setError(result.reason);
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
		setStatus('Note removed');
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
			setStatus(`Motif "${motif.name}" saved`);
			motifMode = false;
		}
	};

	const includeTripletGroups = (noteIds: string[]) => {
		if (!composer?.notes.length) return noteIds;
		const set = new Set(noteIds);
		composer.notes.forEach((note) => {
			if (set.has(note.id) && note.groupType === 'triplet-eighth' && note.groupId) {
				composer.notes
					.filter((entry) => entry.groupId === note.groupId)
					.forEach((entry) => set.add(entry.id));
			}
		});
		return Array.from(set);
	};

	const handleNoteSelection = (event: CustomEvent<{ noteIds: string[] }>) => {
		selectedNoteIds = includeTripletGroups(event.detail.noteIds);
		selectedNoteId = null;
		selectedMotifId = null;
	};

	const handleSelectionMove = (event: CustomEvent<{ noteIds: string[]; tickDelta: number; rowDelta: number }>) => {
		const result = composerStore.moveNotesGroup(event.detail.noteIds, event.detail.tickDelta, event.detail.rowDelta);
		handlePlacementResult(result);
	};

	const clearSelection = () => {
		selectedNoteIds = [];
	};

	const deleteSelectedNotes = () => {
		if (!selectedNoteIds.length) return;
		composerStore.removeNotes(selectedNoteIds);
		selectedNoteIds = [];
		setStatus('Selection deleted');
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
		setStatus('Triplet removed');
	};

	const handleNoteOptionSelect = (definitionId: string) => {
		selectedMotifId = null;
		if (multiSelectEnabled) {
			multiSelectEnabled = false;
			selectedNoteIds = [];
		}
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
let pausedAtSeconds = 0;

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

	const pausePlayback = async () => {
		if (!audioPlayer) return;
		pausedAtSeconds = playheadSeconds;
		await audioPlayer.stop();
		progressLoop.stop();
		isPlaying = false;
	};

	const handlePlay = async () => {
		if (!audioPlayer || !composer.notes.length) return;
		if (isPlaying) {
			await pausePlayback();
			return;
		}
		const startOffset = Math.max(0, pausedAtSeconds);
		const { duration, started } = await audioPlayer.play(composer, startOffset);
		if (!duration) {
			pausedAtSeconds = 0;
			return;
		}
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
					pausedAtSeconds = 0;
					audioPlayer?.stop({ allowTail: true });
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
		pausedAtSeconds = 0;
	};

	const handleClear = async () => {
		if (confirm('Clear grid?')) {
			await handleRestart();
			composerStore.clear();
			setStatus('Grid cleared');
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
		if (motifMode) {
			setStatus('Motif selection enabled — drag to capture a pattern.', { persist: true });
		} else {
			setStatus('');
		}
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
			setStatus('Composition loaded');
		} catch (error) {
			setError('Invalid JSON file');
			console.error(error);
		}
	};

	const removeMotif = (motifId: string) => composerStore.removeMotif(motifId);

	const openDialog = (mode: 'save' | 'export') => {
		dialogMode = mode;
		requestingName = composer.compositionName.trim() || 'composition';
		nameError = '';
		setError('');
		if (mode === 'save') {
			exportOptions = { grid: false, audio: false, json: true };
		} else {
			exportOptions = { grid: true, audio: false, json: false };
		}
		isSaveDialogOpen = true;
	};

	const handleExport = async () => {
		const defaultName = composer.compositionName.trim() || 'composition';
		const safeName = slugify(defaultName);
		nameError = '';
		setError('');
		exporting = true;

		if (exportOptions.grid) {
			const image = gridApi?.capture();
			if (image) {
				exportGridPdf(image, composer);
			} else {
				setError('Canvas not ready yet');
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
		setStatus(dialogMode === 'save' ? 'Composition saved locally' : 'Export complete');
	};

	const lastSaved = () => new Date(composer.updatedAt).toLocaleTimeString();
</script>

<section class="composer-shell">
	<aside class:collapsed={sidebarCollapsed} class="sidebar glass-panel">
	<div class="sidebar__toggle">
		<button
			type="button"
			class:collapsed={sidebarCollapsed}
			aria-label={sidebarCollapsed ? 'Expand tool sidebar' : 'Collapse tool sidebar'}
			aria-expanded={!sidebarCollapsed}
			on:click={toggleSidebar}>
			<span class="sidebar__toggle-icon" aria-hidden="true">
				<span></span>
				<span></span>
				<span></span>
			</span>
		</button>
		{#if !sidebarCollapsed}
				<div>
					<h4>Palette & motifs</h4>
					<p>Pick a block, build your composition.</p>
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
								class:active={!multiSelectEnabled && selectedNoteId === option.id}
								disabled={isNoteDisabled(option)}
								on:click={() => handleNoteOptionSelect(option.id)}>
								<span
									class="note-glyph"
									aria-hidden="true"
									style={`background-color: ${colorToHex(option.color)}; opacity: 0.8;`}>
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
					<button
						type="button"
						class="icon-button"
						class:active={multiSelectEnabled}
						on:click={() => {
							multiSelectEnabled = !multiSelectEnabled;
							if (!multiSelectEnabled) clearSelection();
						}}>
						<span class="icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<rect x="5" y="5" width="6" height="6" rx="1.5" />
								<rect x="13" y="5" width="6" height="6" rx="1.5" />
								<rect x="5" y="13" width="6" height="6" rx="1.5" />
								<path d="M13 16h6M16 13v6" />
							</svg>
						</span>
						<span>{multiSelectEnabled ? 'Disable multi-select' : 'Enable multi-select'}</span>
					</button>
					<button type="button" class="icon-button" on:click={() => backgroundInput?.click()}>
						<span class="icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3.75" y="5.25" width="16.5" height="13.5" rx="2.25" />
								<circle cx="10" cy="10" r="1.8" />
								<path d="M5.5 16l3.5-3.5 3 3 3.5-4.5L18.5 16" />
							</svg>
						</span>
						<span>Set background</span>
					</button>
					{#if composer.backgroundImage}
						<button type="button" class="icon-button" on:click={() => composerStore.setBackgroundImage(undefined)}>
							<span class="icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
									<path d="M5 5l14 14" />
									<path d="M19 5L5 19" />
								</svg>
							</span>
							<span>Clear background</span>
						</button>
					{/if}
					<button type="button" class="icon-button" on:click={() => jsonInput?.click()}>
						<span class="icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12 4.5v10" />
								<path d="M8.5 10.5l3.5 3.5 3.5-3.5" />
								<path d="M5 19.5h14" />
							</svg>
						</span>
						<span>Load JSON</span>
					</button>
					<span class="autosave">Autosaved {lastSaved()}</span>
					{#if selectedNoteIds.length}
						<div class="selection-panel">
							<div>
								<strong>{selectedNoteIds.length} selected</strong>
							</div>
							<div class="selection-panel__actions">
								<button type="button" on:click={deleteSelectedNotes}>Delete</button>
							</div>
						</div>
					{/if}
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
			<div class="status-stack" aria-live="polite">
				<span class="status status--success" class:status--visible={Boolean(statusMessage)}>{statusMessage}</span>
				<span class="status status--error" class:status--visible={Boolean(errorMessage)}>{errorMessage}</span>
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
				selectedNoteIds={selectedNoteIds}
				multiSelectEnabled={multiSelectEnabled}
				on:place={handlePlace}
				on:move={handleMove}
				on:delete={handleDelete}
				on:moveTripletMember={handleTripletMemberMove}
				on:moveTripletGroup={handleTripletGroupMove}
				on:deleteTripletGroup={handleTripletGroupDelete}
				on:placeMotif={handlePlaceMotif}
				on:motifSelection={handleMotifSelection}
				on:noteSelection={handleNoteSelection}
				on:moveSelection={handleSelectionMove}
				on:ready={handleReady}
			/>
		</div>
	</div>
</section>

<footer class="control-dock glass-panel">
	<div class="dock-group">
		<button class="primary icon-button" on:click={handlePlay} disabled={!composer.notes.length}>
			<span class="icon" aria-hidden="true">
				{#if isPlaying}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<line x1="9" y1="7" x2="9" y2="17" />
						<line x1="15" y1="7" x2="15" y2="17" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
						<path d="M9 7l8 5-8 5z" />
					</svg>
				{/if}
			</span>
			<span>{isPlaying ? 'Pause' : 'Play'}</span>
		</button>
		<button class="icon-button" on:click={handleRestart}>
			<span class="icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9.5 5.5L5.5 9l4 3.5" />
					<path d="M7 9h7a5 5 0 1 1-4.4 7.4" />
				</svg>
			</span>
			<span>Restart</span>
		</button>
		<button class="icon-button" on:click={handleClear}>
			<span class="icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6.5 8.5h11" />
					<path d="M9 8.5l.8 10h4.4l.8-10" />
					<path d="M10 5.5h4" />
					<path d="M8 5.5l1-1.5h6l1 1.5" />
				</svg>
			</span>
			<span>Clear</span>
		</button>
	</div>
	<div class="dock-group">
		<label class="tempo icon-button">
			<span class="icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10 4.5l-4 15h12l-3.5-12" />
					<path d="M10.5 11l6-4" />
				</svg>
			</span>
			<span>Tempo</span>
			<select value={composer.tempo} on:change={handleTempoChange}>
				{#each TEMPOS as tempo}
					<option value={tempo.id}>{tempo.label}</option>
				{/each}
			</select>
		</label>
		<button class="icon-button" on:click={() => openDialog('save')}>
			<span class="icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M7 7h10" />
					<path d="M12 3.5v7.5" />
					<path d="M6 12h12v8H6z" />
				</svg>
			</span>
			<span>Save</span>
		</button>
		<button class="icon-button" on:click={() => openDialog('export')}>
			<span class="icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 13.5V4.5" />
					<path d="M15.5 7.5L12 4 8.5 7.5" />
					<path d="M5 13.5v6h14v-6" />
				</svg>
			</span>
			<span>Export</span>
		</button>
	</div>
</footer>

{#if isSaveDialogOpen}
	<div class="modal-backdrop">
		<form class="dialog glass-panel" on:submit|preventDefault={handleExport}>
			{#if dialogMode === 'save'}
				<h3>Save Composition</h3>
				<p>Would you like to save your composition <strong>{composer.compositionName || 'composition'}</strong>?</p>
			{:else}
				<h3>Export</h3>
				<p>Choose which assets to export.</p>
				<p class="note">Using file name <strong>{composer.compositionName || 'composition'}</strong>.</p>
				<label><input type="checkbox" bind:checked={exportOptions.grid} /> Grid (PDF)</label>
				<label><input type="checkbox" bind:checked={exportOptions.audio} /> Sound (WAV)</label>
			{/if}
			<div class="dialog-actions">
				<button class="primary" type="submit" disabled={exporting}>
					{#if exporting}
						{dialogMode === 'export' ? 'Exporting…' : 'Downloading…'}
					{:else}
						{dialogMode === 'export' ? 'Export' : 'Download'}
					{/if}
				</button>
				<button class="secondary" type="button" on:click={() => (isSaveDialogOpen = false)}>Cancel</button>
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
		color: #1f2343;
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
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(250, 246, 255, 0.95)),
			radial-gradient(circle at 20% 10%, rgba(255, 205, 175, 0.35), transparent 45%),
			radial-gradient(circle at 80% 0%, rgba(167, 210, 255, 0.3), transparent 50%);
		border: 1px solid rgba(255, 255, 255, 0.7);
		box-shadow: 0 22px 55px rgba(31, 35, 67, 0.18);
		color: #1f2343;
	}

	.sidebar::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: radial-gradient(circle, rgba(255, 255, 255, 0.5) 1px, transparent 0);
		background-size: 28px 28px;
		opacity: 0.35;
		pointer-events: none;
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
		border: 1px solid rgba(31, 35, 67, 0.1);
		background: rgba(255, 255, 255, 0.9);
		border-radius: 12px;
		color: inherit;
		padding: 0.25rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
	}

	.sidebar__toggle-icon {
		display: inline-flex;
		flex-direction: column;
		gap: 4px;
		width: 20px;
	}

	.sidebar__toggle-icon span {
		display: block;
		height: 2px;
		width: 100%;
		background: currentColor;
		border-radius: 999px;
		transition: transform 0.2s ease;
	}

	.sidebar__toggle button:not(.collapsed) .sidebar__toggle-icon span:nth-child(2) {
		transform: translateX(4px);
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
		padding: 0.5rem 0.5rem calc(var(--dock-height) + 0.5rem) 0.5rem;
		scrollbar-width: thin;
		max-height: calc(100% - var(--dock-height) - 80px);
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
		border: 2px solid rgba(31, 35, 67, 0.18);
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(244, 244, 255, 0.92));
		color: #1f2343;
		cursor: pointer;
		box-shadow: 0 12px 28px rgba(31, 35, 67, 0.12);
		transition: border-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
	}

	.note-card:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 16px 36px rgba(31, 35, 67, 0.18);
	}

	.note-card:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.note-card.active {
		border-color: rgba(255, 173, 143, 0.9);
		background: linear-gradient(125deg, rgba(255, 205, 155, 0.45), rgba(255, 155, 205, 0.45));
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
		padding: 4px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.85);
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.note-glyph img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
	}

	:global(.note-glyph.missing)::after {
		content: 'PNG';
		font-size: 0.8rem;
		color: var(--muted);
	}

	.motif-actions {
		display: flex;
		justify-content: flex-start;
		margin-bottom: 0.5rem;
	}

	.motif-section button {
		border-radius: 999px;
		border: 1px solid rgba(31, 35, 67, 0.12);
		background: rgba(255, 255, 255, 0.85);
		color: #1f2343;
		padding: 0.3rem 0.85rem;
		cursor: pointer;
		box-shadow: 0 10px 20px rgba(31, 35, 67, 0.1);
	}

	.motif-section button.active {
		background: linear-gradient(120deg, #ffb677, #ff8bc6);
		color: #4a2056;
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
		border: 1px solid rgba(255, 255, 255, 0.8);
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(244, 246, 255, 0.92));
		cursor: pointer;
		box-shadow: 0 10px 24px rgba(31, 35, 67, 0.12);
		color: #1f2343;
	}

	.motif-card.active {
		border-color: rgba(138, 180, 255, 0.9);
		background: linear-gradient(135deg, rgba(138, 180, 255, 0.25), rgba(200, 255, 224, 0.25));
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
		color: rgba(31, 35, 67, 0.6);
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
		border: 1px solid rgba(31, 35, 67, 0.22);
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(247, 245, 255, 0.9));
		color: inherit;
		box-shadow: 0 12px 24px rgba(31, 35, 67, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
		padding: 0.5rem 0.85rem;
		cursor: pointer;
		text-align: left;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	.sidebar-actions button:hover {
		transform: translateY(-1px);
		box-shadow: 0 14px 28px rgba(31, 35, 67, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.4);
	}

	.sidebar-actions button.active {
		border-color: rgba(255, 173, 143, 0.8);
		background: linear-gradient(120deg, rgba(255, 205, 155, 0.55), rgba(255, 155, 205, 0.45));
	}

	.selection-panel {
		border: 1px dashed rgba(31, 35, 67, 0.2);
		border-radius: 12px;
		padding: 0.65rem 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		background: rgba(255, 255, 255, 0.65);
	}

	.selection-panel__actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.icon-button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: inherit;
	}

	.icon svg {
		width: 100%;
		height: 100%;
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
		border: 1px solid rgba(31, 35, 67, 0.12);
		background: rgba(255, 255, 255, 0.9);
		color: inherit;
		padding: 0.35rem 0.9rem;
		border-radius: 999px;
		cursor: pointer;
		box-shadow: 0 10px 24px rgba(31, 35, 67, 0.12);
	}

	.workspace-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.75rem 1.5rem 0.5rem;
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(244, 244, 255, 0.9));
		border: 1px solid rgba(255, 255, 255, 0.7);
		box-shadow: 0 18px 40px rgba(31, 35, 67, 0.12);
		color: #1f2343;
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
		justify-content: flex-end;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0.4rem;
		min-width: 200px;
		min-height: 34px;
	}

	.status {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.8rem;
		border-radius: 999px;
		font-size: 0.8rem;
		white-space: nowrap;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transform: translateY(4px);
		transition: opacity 0.2s ease, transform 0.2s ease;
	}

	.status--visible {
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
		transform: translateY(0);
	}

	.status--success {
		background: linear-gradient(120deg, #c8ffd9, #faffc7);
		border: none;
		color: #145135;
		box-shadow: 0 10px 24px rgba(46, 204, 113, 0.25);
	}

	.status--error {
		background: linear-gradient(120deg, #ffd5e3, #ffe2d6);
		border: none;
		color: #7a1434;
		box-shadow: 0 10px 24px rgba(255, 107, 129, 0.25);
	}

	.grid-stage {
		flex: 1;
		min-height: 0;
		padding: 0.5rem;
		overflow: hidden;
		background: linear-gradient(140deg, #f7f4ff, #eaf0ff);
		border: 1px solid rgba(255, 255, 255, 0.6);
		box-shadow: 0 15px 30px rgba(31, 35, 67, 0.12);
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
		background: linear-gradient(150deg, rgba(255, 255, 255, 0.98), rgba(244, 244, 255, 0.94));
		border: 1px solid rgba(255, 255, 255, 0.75);
		box-shadow: 0 18px 45px rgba(31, 35, 67, 0.15);
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
		border: 1px solid rgba(31, 35, 67, 0.12);
		background: rgba(255, 255, 255, 0.9);
		color: inherit;
		padding: 0.4rem 0.9rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		box-shadow: 0 12px 24px rgba(31, 35, 67, 0.12);
	}

	.control-dock .tempo select {
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid rgba(31, 35, 67, 0.15);
		color: inherit;
		border-radius: 999px;
		padding: 0.15rem 0.65rem;
		box-shadow: 0 6px 18px rgba(31, 35, 67, 0.12);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(12, 18, 40, 0.6);
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
		background: linear-gradient(140deg, rgba(255, 255, 255, 0.97), rgba(248, 248, 255, 0.95));
		border: 1px solid rgba(255, 255, 255, 0.8);
		color: #1f2343;
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
