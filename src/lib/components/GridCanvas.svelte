<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import {
		Application,
		Container,
		Graphics,
		Sprite,
		Text,
		type FederatedPointerEvent
	} from 'pixi.js';
	import { METERS, NOTE_PALETTE, SCALES } from '$lib/constants/music';
	import { TICKS_PER_BEAT, type MeterId, type Motif, type PlacedNote, type ScaleId } from '$lib/types/composer';
	import { isNoteActive } from '$lib/utils/highlight';

	const CELL_WIDTH = 48;
const CELL_HEIGHT = 32;
	const GRID_PADDING = 16;
	const LEFT_GUTTER = 90;
	const PALETTE_HEIGHT = 240;

	type DragSource = 'palette-note' | 'existing-note' | 'motif';

	type ActiveDrag = {
		source: DragSource;
		definitionId?: string;
		noteId?: string;
		motifId?: string;
		durationTicks: number;
		rowSpan: number;
		offsetX: number;
		offsetY: number;
		ghost: Graphics;
	};

	export let notes: PlacedNote[] = [];
	export let meter: MeterId = '4/4';
	export let scale: ScaleId = 'c-major';
	export let motifs: Motif[] = [];
	export let motifMode = false;
	export let backgroundImage: string | undefined;
	export let playheadSeconds = 0;
	export let bpm = 80;

	const dispatch = createEventDispatcher<{
		place: { definitionId: string; startTick: number; rowIndex: number; durationTicks: number };
		move: { noteId: string; startTick: number; rowIndex: number; durationTicks: number };
		delete: { noteId: string };
		placeMotif: { motifId: string; startTick: number; rowIndex: number };
		motifSelection: { noteIds: string[] };
		ready: { capture: () => string | null };
	}>();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let app: Application | null = null;
	let backgroundLayer: Container;
	let gridLayer: Container;
	let labelLayer: Container;
	let noteLayer: Container;
	let highlightLayer: Container;
	let paletteLayer: Container;
let highlightBox: Graphics;
	let backgroundSprite: Sprite | null = null;
	let selectionGraphic: Graphics;

	let gridWidth = 0;
	let gridHeight = 0;
	let canvasWidth = 0;
	let canvasHeight = 0;
	let totalTicks = 0;
	let pxPerTick = 0;
	let paletteStartY = 0;
	const gridOriginX = LEFT_GUTTER;
	const gridOriginY = GRID_PADDING;

	let activeDrag: ActiveDrag | null = null;
let selectionStart: { x: number; y: number } | null = null;
const noteRects = new Map<string, { x: number; y: number; width: number; height: number }>();

const lightenColor = (color: number, factor = 0.35) => {
	const r = Math.min(255, ((color >> 16) & 0xff) * (1 + factor));
	const g = Math.min(255, ((color >> 8) & 0xff) * (1 + factor));
	const b = Math.min(255, (color & 0xff) * (1 + factor));
	return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

	onMount(async () => {
		canvas = document.createElement('canvas');
		host.appendChild(canvas);
		app = new Application();
	await app.init({
		canvas,
		backgroundAlpha: 0,
		antialias: true,
		powerPreference: 'high-performance',
		resolution: window.devicePixelRatio ?? 1,
		width: 800,
		height: 600,
		preserveDrawingBuffer: true
	});

		backgroundLayer = new Container();
		gridLayer = new Container();
		labelLayer = new Container();
		noteLayer = new Container();
		highlightLayer = new Container();
		paletteLayer = new Container();
		highlightBox = new Graphics();
		selectionGraphic = new Graphics();
		selectionGraphic.visible = false;

		app.stage.addChild(backgroundLayer, gridLayer, labelLayer, noteLayer, highlightLayer, paletteLayer);
		highlightLayer.addChild(highlightBox, selectionGraphic);

		app.stage.eventMode = 'static';
		app.stage.hitArea = app.screen;
		app.stage.on('pointerdown', handlePointerDown);
		app.stage.on('pointermove', handlePointerMove);
		app.stage.on('pointerup', handlePointerUp);
		app.stage.on('pointerupoutside', handlePointerUp);

		calculateMetrics();
		renderGrid();
		renderLabels();
		renderBackground();
		renderNotes();
		renderPalette();
		dispatch('ready', { capture: captureImage });
	});

	onDestroy(() => {
		app?.destroy(true);
		canvas?.remove();
	});

	const captureImage = () => canvas?.toDataURL('image/png') ?? null;

	const getScaleRows = () => SCALES[scale].rows;

	const calculateMetrics = () => {
		const meterConfig = METERS[meter];
		gridWidth = meterConfig.totalBeats * CELL_WIDTH;
		gridHeight = getScaleRows().length * CELL_HEIGHT;
		totalTicks = meterConfig.totalBeats * TICKS_PER_BEAT;
		pxPerTick = gridWidth / totalTicks;
		paletteStartY = gridOriginY + gridHeight + GRID_PADDING;
		canvasWidth = gridOriginX + gridWidth + GRID_PADDING;
		canvasHeight = paletteStartY + PALETTE_HEIGHT;
	};

	const renderGrid = () => {
		gridLayer.removeChildren();
		const meterConfig = METERS[meter];
		const rows = getScaleRows();
		const background = new Graphics();
		background.roundRect(gridOriginX, gridOriginY, gridWidth, gridHeight, 12).fill(0x0b1221).alpha = 0.82;
		gridLayer.addChild(background);

		const measureTicks = meterConfig.beatsPerMeasure * TICKS_PER_BEAT;
		for (let row = 0; row <= rows.length; row += 1) {
			const y = gridOriginY + row * CELL_HEIGHT;
			const line = new Graphics();
			line.moveTo(gridOriginX, y).lineTo(gridOriginX + gridWidth, y).stroke({ color: 0x1d2a44, width: row % rows.length === 0 ? 2 : 1 });
			gridLayer.addChild(line);
		}

		for (let tick = 0; tick <= totalTicks; tick += TICKS_PER_BEAT) {
			const isBarline = tick % measureTicks === 0;
			const x = gridOriginX + (tick / totalTicks) * gridWidth;
			const line = new Graphics();
			line.moveTo(x, gridOriginY)
				.lineTo(x, gridOriginY + gridHeight)
				.stroke({ color: isBarline ? 0xffffff : 0x2b3c5c, width: isBarline ? 2 : 1, alpha: isBarline ? 0.9 : 0.5 });
			gridLayer.addChild(line);
		}
	};

	const renderLabels = () => {
		labelLayer.removeChildren();
		getScaleRows().forEach((label, index) => {
			const text = new Text({ text: label, style: { fill: '#dfe6f2', fontSize: 12, fontFamily: 'Poppins, sans-serif' } });
			text.x = 10;
			text.y = gridOriginY + index * CELL_HEIGHT + CELL_HEIGHT / 2 - 8;
			labelLayer.addChild(text);
		});
	};

	const renderBackground = () => {
		backgroundLayer.removeChildren();
		if (!backgroundImage) return;
		backgroundSprite = Sprite.from(backgroundImage);
		backgroundSprite.x = gridOriginX;
		backgroundSprite.y = gridOriginY;
		backgroundSprite.width = gridWidth;
		backgroundSprite.height = gridHeight;
		backgroundSprite.alpha = 0.4;
		backgroundLayer.addChild(backgroundSprite);
	};

	const renderNotes = () => {
		noteLayer.removeChildren();
		noteRects.clear();
		const progressSeconds = playheadSeconds;
		notes.forEach((note) => {
			const width = note.durationTicks * pxPerTick;
			const height = CELL_HEIGHT - 4;
			const x = tickToX(note.startTick);
			const y = rowToY(note.rowIndex);
			noteRects.set(note.id, { x, y, width, height });
			const graphic = new Graphics();
			const active = playheadSeconds > 0 && isNoteActive(note, progressSeconds, bpm);
			const fillColor = active ? lightenColor(note.color) : note.color;
			graphic
				.roundRect(x, y, width, height, 6)
				.fill(fillColor)
				.stroke({ color: active ? 0xffffff : 0x000000, width: active ? 2 : 0, alpha: active ? 0.9 : 0 });
			graphic.alpha = active ? 1 : 0.9;
			graphic.cursor = motifMode ? 'crosshair' : 'pointer';
			graphic.eventMode = motifMode ? 'none' : 'static';
			graphic.on('pointerdown', (event: FederatedPointerEvent) => startExistingNoteDrag(note, graphic, event));
			graphic.on('rightdown', () => dispatch('delete', { noteId: note.id }));
			noteLayer.addChild(graphic);
		});
	};

	const renderPalette = () => {
		paletteLayer.removeChildren();
		let cursorX = gridOriginX;
		let cursorY = paletteStartY + 24;

		const noteLabel = new Text({ text: 'Note palette', style: { fill: '#f5f7ff', fontSize: 14 } });
		noteLabel.x = gridOriginX;
		noteLabel.y = cursorY - 18;
		paletteLayer.addChild(noteLabel);

		NOTE_PALETTE.forEach((definition) => {
			const width = Math.max(definition.durationBeats * CELL_WIDTH, 50);
			const graphic = new Graphics();
			graphic.roundRect(cursorX, cursorY, width, CELL_HEIGHT - 6, 6).fill(definition.color, 0.85);
			graphic.cursor = motifMode ? 'not-allowed' : 'grab';
			graphic.eventMode = motifMode ? 'none' : 'static';
			graphic.on('pointerdown', (event: FederatedPointerEvent) => startPaletteNoteDrag(definition.id, definition.durationTicks, event));
			const label = new Text({ text: definition.label, style: { fill: '#dfe6f2', fontSize: 11 } });
			label.x = cursorX;
			label.y = cursorY + CELL_HEIGHT - 2;
			paletteLayer.addChild(graphic, label);
			cursorX += width + 24;
			if (cursorX + width > gridOriginX + gridWidth) {
				cursorX = gridOriginX;
				cursorY += CELL_HEIGHT + 32;
			}
		});

		if (!motifs.length) return;
		cursorY += CELL_HEIGHT + 48;
		const motifLabel = new Text({ text: 'Motifs', style: { fill: '#f5f7ff', fontSize: 14 } });
		motifLabel.x = gridOriginX;
		motifLabel.y = cursorY - 18;
		paletteLayer.addChild(motifLabel);
		motifs.forEach((motif) => {
			const width = Math.max(motif.widthTicks * pxPerTick, 60);
			const height = motif.rowSpan * CELL_HEIGHT - 6;
			const graphic = new Graphics();
			graphic.roundRect(cursorX, cursorY, width, height, 8).fill(0xffffff, 0.18).stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
			graphic.cursor = motifMode ? 'not-allowed' : 'grab';
			graphic.eventMode = motifMode ? 'none' : 'static';
			graphic.on('pointerdown', (event: FederatedPointerEvent) => startMotifDrag(motif, event));
			const label = new Text({ text: motif.name, style: { fill: '#dfe6f2', fontSize: 11 } });
			label.x = cursorX;
			label.y = cursorY + height + 2;
			paletteLayer.addChild(graphic, label);
			cursorX += width + 24;
			if (cursorX + width > gridOriginX + gridWidth) {
				cursorX = gridOriginX;
				cursorY += height + 32;
			}
		});
	};

	const startPaletteNoteDrag = (definitionId: string, durationTicks: number, event: FederatedPointerEvent) => {
		if (motifMode) return;
		const ghost = new Graphics();
		ghost.roundRect(0, 0, durationTicks * pxPerTick, CELL_HEIGHT - 4, 6).fill(0xffffff, 0.6);
		highlightLayer.addChild(ghost);
		activeDrag = {
			source: 'palette-note',
			definitionId,
			durationTicks,
			rowSpan: 1,
			offsetX: ghost.width / 2,
			offsetY: ghost.height / 2,
			ghost
		};
		updateGhostPosition(event.global.x, event.global.y);
	};

	const startExistingNoteDrag = (note: PlacedNote, graphic: Graphics, event: FederatedPointerEvent) => {
		if (motifMode) return;
		const ghost = new Graphics();
		ghost.roundRect(0, 0, note.durationTicks * pxPerTick, CELL_HEIGHT - 4, 6).fill(note.color, 0.8);
		highlightLayer.addChild(ghost);
		activeDrag = {
			source: 'existing-note',
			noteId: note.id,
			definitionId: note.noteDefinitionId,
			durationTicks: note.durationTicks,
			rowSpan: 1,
			offsetX: event.global.x - graphic.x,
			offsetY: event.global.y - graphic.y,
			ghost
		};
		updateGhostPosition(event.global.x, event.global.y);
	};

	const startMotifDrag = (motif: Motif, event: FederatedPointerEvent) => {
		if (motifMode) return;
		const ghost = new Graphics();
		ghost.roundRect(0, 0, motif.widthTicks * pxPerTick, motif.rowSpan * CELL_HEIGHT - 4, 8).fill(0xffffff, 0.35);
		highlightLayer.addChild(ghost);
		activeDrag = {
			source: 'motif',
			motifId: motif.id,
			durationTicks: motif.widthTicks,
			rowSpan: motif.rowSpan,
			offsetX: ghost.width / 2,
			offsetY: ghost.height / 2,
			ghost
		};
		updateGhostPosition(event.global.x, event.global.y);
	};

	const updateGhostPosition = (x: number, y: number) => {
		if (!activeDrag) return;
		activeDrag.ghost.position.set(x - activeDrag.offsetX, y - activeDrag.offsetY);
		const candidate = pointerToCandidate(x, y, activeDrag.durationTicks, activeDrag.rowSpan);
		if (!candidate) {
			showHighlight(null, false, activeDrag.rowSpan, activeDrag.durationTicks);
			return;
		}
		const collision = rowHasCollision(candidate.rowIndex, candidate.startTick, activeDrag.durationTicks, activeDrag.noteId);
		const valid = respectsBarlines(candidate.startTick, activeDrag.durationTicks) && !collision;
		showHighlight(candidate, valid, activeDrag.rowSpan, activeDrag.durationTicks);
	};

	const pointerToCandidate = (x: number, y: number, durationTicks: number, rowSpan: number) => {
		if (!isInsideGrid(x, y)) return null;
		const rows = getScaleRows();
		const relativeX = x - gridOriginX;
		const relativeY = y - gridOriginY;
		const rowIndex = Math.floor(relativeY / CELL_HEIGHT);
		if (rowIndex < 0 || rowIndex + rowSpan > rows.length) return null;
		const startTick = Math.max(0, Math.min(Math.round(relativeX / pxPerTick), totalTicks - durationTicks));
		return { rowIndex, startTick };
	};

	const respectsBarlines = (startTick: number, durationTicks: number) => {
		const measureTicks = METERS[meter].beatsPerMeasure * TICKS_PER_BEAT;
		const startMeasure = Math.floor(startTick / measureTicks);
		const endMeasure = Math.floor((startTick + durationTicks - 1) / measureTicks);
		return startMeasure === endMeasure;
	};

	const showHighlight = (
		candidate: { rowIndex: number; startTick: number } | null,
		valid: boolean,
		rowSpan: number,
		durationTicks: number
	) => {
		highlightBox.clear();
		if (!candidate) return;
		const color = valid ? 0x2ecc71 : 0xe74c3c;
		highlightBox.roundRect(
			tickToX(candidate.startTick),
			rowToY(candidate.rowIndex),
			durationTicks * pxPerTick,
			rowSpan * CELL_HEIGHT - 4,
			8
		).stroke({ color, width: 2, alpha: 0.9 });
	};

	const handlePointerDown = (event: FederatedPointerEvent) => {
		if (!motifMode) return;
		if (!isInsideGrid(event.global.x, event.global.y)) return;
		selectionStart = { x: event.global.x, y: event.global.y };
		selectionGraphic.clear();
		selectionGraphic.visible = true;
	};

	const handlePointerMove = (event: FederatedPointerEvent) => {
		if (selectionStart) {
			updateSelectionRect(event.global.x, event.global.y);
			return;
		}
		if (!activeDrag) return;
		updateGhostPosition(event.global.x, event.global.y);
	};

	const handlePointerUp = (event: FederatedPointerEvent) => {
		if (selectionStart) {
			finalizeSelection(event.global.x, event.global.y);
			return;
		}
		const candidate = pointerToCandidate(event.global.x, event.global.y, activeDrag?.durationTicks ?? 0, activeDrag?.rowSpan ?? 1);
		if (activeDrag?.source === 'existing-note' && !candidate) {
			deleteNoteAtPointer(event);
		}
		if (!activeDrag) return;
		if (candidate) {
			if (activeDrag.source === 'existing-note' && activeDrag.noteId) {
				dispatch('move', {
					noteId: activeDrag.noteId,
					startTick: candidate.startTick,
					rowIndex: candidate.rowIndex,
					durationTicks: activeDrag.durationTicks
				});
			} else if (activeDrag.source === 'palette-note' && activeDrag.definitionId) {
				dispatch('place', {
					definitionId: activeDrag.definitionId,
					startTick: candidate.startTick,
					rowIndex: candidate.rowIndex,
					durationTicks: activeDrag.durationTicks
				});
			} else if (activeDrag.source === 'motif' && activeDrag.motifId) {
				dispatch('placeMotif', {
					motifId: activeDrag.motifId,
					startTick: candidate.startTick,
					rowIndex: candidate.rowIndex
				});
			}
		}
		cleanupDrag();
	};

	const cleanupDrag = () => {
		activeDrag?.ghost.destroy();
		activeDrag = null;
		highlightBox.clear();
	};

	const deleteNoteAtPointer = (event: FederatedPointerEvent) => {
		if (!activeDrag || activeDrag.source !== 'existing-note' || !activeDrag.noteId) return;
		if (isInsideGrid(event.global.x, event.global.y)) return;
		dispatch('delete', { noteId: activeDrag.noteId });
	};

	const updateSelectionRect = (x: number, y: number) => {
		if (!selectionStart) return;
		selectionGraphic.clear();
		const rect = normalizeRect(selectionStart.x, selectionStart.y, x, y);
		selectionGraphic.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: 0xf4d03f, width: 2 });
	};

	const finalizeSelection = (x: number, y: number) => {
		if (!selectionStart) return;
		selectionGraphic.clear();
		selectionGraphic.visible = false;
		const rect = normalizeRect(selectionStart.x, selectionStart.y, x, y);
		selectionStart = null;
		const selected: string[] = [];
		noteRects.forEach((bounds, noteId) => {
			if (rectsIntersect(rect, bounds)) selected.push(noteId);
		});
		if (selected.length) dispatch('motifSelection', { noteIds: selected });
	};

	const normalizeRect = (x1: number, y1: number, x2: number, y2: number) => {
		const minX = Math.min(x1, x2);
		const minY = Math.min(y1, y2);
		return { x: minX, y: minY, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
	};

	const rectsIntersect = (
		a: { x: number; y: number; width: number; height: number },
		b: { x: number; y: number; width: number; height: number }
	) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

	const rowHasCollision = (rowIndex: number, startTick: number, durationTicks: number, ignoreId?: string) => {
		const candidateEnd = startTick + durationTicks;
		return notes.some((note) => {
			if (note.rowIndex !== rowIndex) return false;
			if (ignoreId && note.id === ignoreId) return false;
			const noteEnd = note.startTick + note.durationTicks;
			return !(candidateEnd <= note.startTick || startTick >= noteEnd);
		});
	};

	const isInsideGrid = (x: number, y: number) =>
		x >= gridOriginX && x <= gridOriginX + gridWidth && y >= gridOriginY && y <= gridOriginY + gridHeight;

	const tickToX = (tick: number) => gridOriginX + tick * pxPerTick;
	const rowToY = (rowIndex: number) => gridOriginY + rowIndex * CELL_HEIGHT;

	$: if (app?.renderer) {
		meter;
		scale;
		bpm;
		calculateMetrics();
		app.renderer.resize(canvasWidth, canvasHeight);
		renderGrid();
		renderLabels();
		renderBackground();
		renderPalette();
		renderNotes();
	}

	$: if (app?.renderer) {
		notes;
		playheadSeconds;
		motifMode;
		renderNotes();
	}

	$: if (app?.renderer) {
		backgroundImage;
		renderBackground();
	}

	$: if (app?.renderer) {
		motifs;
		motifMode;
		renderPalette();
	}

	$: if (app && !motifMode) {
		selectionGraphic?.clear();
		selectionGraphic && (selectionGraphic.visible = false);
		selectionStart = null;
	}
</script>

<div class="grid-shell" bind:this={host}></div>

<style>
.grid-shell {
	width: 100%;
	padding: 0.75rem;
	border-radius: 20px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: linear-gradient(160deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
	overflow-x: auto;
	box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

:global(canvas) {
	max-width: 100%;
	image-rendering: pixelated;
	border-radius: 16px;
}
</style>
