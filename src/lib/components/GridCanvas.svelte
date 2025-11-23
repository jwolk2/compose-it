<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
import {
	Application,
	Container,
	Graphics,
	Text,
	type FederatedPointerEvent
} from 'pixi.js';
import { METERS, NOTE_PALETTE, SCALES } from '$lib/constants/music';
	import { TICKS_PER_BEAT, type MeterId, type Motif, type PlacedNote, type ScaleId } from '$lib/types/composer';
	import { isNoteActive } from '$lib/utils/highlight';

const BASE_CELL_HEIGHT = 32;
const GRID_PADDING = 16;
const LEFT_GUTTER = 90;
const SIXTEENTHS_PER_BEAT = 4;
const SIXTEENTH_TICK_SIZE = TICKS_PER_BEAT / SIXTEENTHS_PER_BEAT || 1;
const NOTE_VERTICAL_PADDING = 2;
const definitionLookup = new Map(NOTE_PALETTE.map((definition) => [definition.id, definition]));

	let cellHeight = BASE_CELL_HEIGHT;

	type DragSource = 'palette-note' | 'existing-note' | 'motif';

type ActiveDrag = {
	source: DragSource;
	definitionId?: string;
	noteId?: string;
	groupId?: string;
	groupType?: string | null;
	groupIndex?: number | null;
	motifId?: string;
	durationTicks: number;
	rowSpan: number;
	offsetX: number;
	offsetY: number;
	ghost: Graphics;
	lockX?: boolean;
	baseStartTick?: number;
	groupMode?: 'single' | 'group';
	limitToBeat?: boolean;
	beatSpanTicks?: number;
	selectionNotes?: Array<{
		id: string;
		tickOffset: number;
		rowOffset: number;
		durationTicks: number;
		color: number;
		groupId?: string | null;
		groupType?: string | null;
		noteDefinitionId: string;
		groupIndex?: number | null;
	}>;
	selectionBase?: { startTick: number; rowIndex: number };
	selectionNoteIds?: Set<string>;
	selectionDelta?: { tickDelta: number; rowDelta: number } | null;
};

	export let notes: PlacedNote[] = [];
	export let meter: MeterId = '4/4';
	export let scale: ScaleId = 'c-major';
export let motifs: Motif[] = [];
export let motifMode = false;
export let selectedNoteDefinition: { definitionId: string; durationTicks: number; color: number } | null = null;
export let selectedMotifId: string | null = null;
export let selectedNoteIds: string[] = [];
export let multiSelectEnabled = false;
export let backgroundImage: string | undefined;
export let playheadSeconds = 0;
export let bpm = 80;

const dispatch = createEventDispatcher<{
	place: { definitionId: string; startTick: number; rowIndex: number; durationTicks: number };
	move: { noteId: string; startTick: number; rowIndex: number; durationTicks: number };
	delete: { noteId: string };
	moveTripletMember: { noteId: string; rowIndex: number };
	moveTripletGroup: { groupId: string; startTick: number };
	deleteTripletGroup: { groupId: string };
	placeMotif: { motifId: string; startTick: number; rowIndex: number };
	motifSelection: { noteIds: string[] };
	noteSelection: { noteIds: string[] };
	moveSelection: { noteIds: string[]; tickDelta: number; rowDelta: number };
	ready: { capture: () => string | null };
}>();

let selectedNoteSet = new Set<string>();

	$: gridShellStyle = backgroundImage ? `--grid-bg: url(${backgroundImage});` : '';
	$: hasBackground = Boolean(backgroundImage);
$: selectedNoteSet = new Set(selectedNoteIds);

let host: HTMLDivElement;
let canvas: HTMLCanvasElement;
let app: Application | null = null;
let resizeObserver: ResizeObserver | null = null;
let gridLayer: Container;
let labelLayer: Container;
let noteLayer: Container;
let highlightLayer: Container;
let highlightBox: Graphics;
let selectionOutline: Graphics;
let selectionFill: Graphics;

	let gridWidth = 0;
	let gridHeight = 0;
	let canvasWidth = 0;
	let canvasHeight = 0;
	let totalTicks = 0;
	let pxPerTick = 0;
	const gridOriginX = LEFT_GUTTER;
	const gridOriginY = GRID_PADDING;

	let activeDrag: ActiveDrag | null = null;
let selectionStart: { x: number; y: number } | null = null;
let selectionContext: 'motif' | 'multi' | null = null;
const noteRects = new Map<string, { x: number; y: number; width: number; height: number }>();

const lightenColor = (color: number, factor = 0.35) => {
	const r = Math.min(255, ((color >> 16) & 0xff) * (1 + factor));
	const g = Math.min(255, ((color >> 8) & 0xff) * (1 + factor));
	const b = Math.min(255, (color & 0xff) * (1 + factor));
	return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const quantizeTick = (tick: number) => {
	const step = SIXTEENTH_TICK_SIZE > 0 ? SIXTEENTH_TICK_SIZE : 1;
	return Math.round(tick / step) * step;
};
const withinSingleBeat = (startTick: number, spanTicks: number) => {
	if (spanTicks <= 0) return true;
	const beat = TICKS_PER_BEAT;
	const endTick = startTick + spanTicks - 1;
	return Math.floor(startTick / beat) === Math.floor(endTick / beat);
};
const noteBlockHeight = (rowSpan = 1) => Math.max(6, rowSpan * cellHeight - NOTE_VERTICAL_PADDING * 2);
const noteBlockY = (rowIndex: number) => rowToY(rowIndex) + NOTE_VERTICAL_PADDING;
const isStartAllowed = (
	startTick: number,
	durationTicks: number,
	definitionId?: string,
	groupType?: string | null,
	groupIndex?: number | null
) => {
	const sixteenth = SIXTEENTH_TICK_SIZE;
	const beatOffset = startTick % TICKS_PER_BEAT;
	if (definitionId === 'triplet-eighth' || groupType === 'triplet-eighth') {
		return (groupIndex ?? 0) === 0 ? beatOffset === 0 : true;
	}
	if (durationTicks > sixteenth) {
		return beatOffset === 0 || beatOffset === sixteenth * 2;
	}
	return true;
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
			width: 1,
			height: 1,
			preserveDrawingBuffer: true
		});

		gridLayer = new Container();
		labelLayer = new Container();
		noteLayer = new Container();
		highlightLayer = new Container();
		highlightBox = new Graphics();
		selectionFill = new Graphics();
		selectionOutline = new Graphics();
		selectionFill.visible = false;
		selectionOutline.visible = false;

		app.stage.addChild(gridLayer, labelLayer, noteLayer, highlightLayer);
		highlightLayer.addChild(highlightBox, selectionFill, selectionOutline);

		app.stage.eventMode = 'static';
		app.stage.hitArea = app.screen;
		app.stage.on('pointerdown', handlePointerDown);
		app.stage.on('pointermove', handlePointerMove);
		app.stage.on('pointerup', handlePointerUp);
		app.stage.on('pointerupoutside', handlePointerUp);

		updateSceneLayout();
		resizeObserver = new ResizeObserver(() => updateSceneLayout());
		resizeObserver.observe(host);
		dispatch('ready', { capture: captureImage });
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		app?.destroy(true);
		canvas?.remove();
	});

	const captureImage = () => canvas?.toDataURL('image/png') ?? null;

	const getScaleRows = () => SCALES[scale].rows;

	const calculateMetrics = () => {
		const meterConfig = METERS[meter];
		const rows = getScaleRows();
		const hostWidth = host?.clientWidth ?? 800;
		const hostHeight = host?.clientHeight ?? 600;
		const usableWidth = Math.max(600, hostWidth - GRID_PADDING);
		gridWidth = Math.max(meterConfig.totalBeats * 32, usableWidth - gridOriginX - GRID_PADDING);
		totalTicks = meterConfig.totalBeats * TICKS_PER_BEAT;
		pxPerTick = gridWidth / totalTicks;
		const maxGridHeight = Math.max(360, hostHeight - GRID_PADDING * 2);
		const computedRowHeight = Math.min(BASE_CELL_HEIGHT, maxGridHeight / rows.length);
		cellHeight = Math.max(22, computedRowHeight);
		gridHeight = rows.length * cellHeight;
		canvasWidth = Math.max(hostWidth, gridOriginX + gridWidth + GRID_PADDING);
		canvasHeight = Math.max(hostHeight, gridOriginY + gridHeight + GRID_PADDING);
	};

	const updateSceneLayout = () => {
		if (!app || !app.renderer) return;
		calculateMetrics();
		app.renderer.resize(Math.max(1, canvasWidth), Math.max(1, canvasHeight));
		renderGrid();
		renderLabels();
		renderNotes();
	};

	const renderGrid = () => {
		gridLayer.removeChildren();
		const meterConfig = METERS[meter];
		const rows = getScaleRows();
		const background = new Graphics();
		const baseAlpha = 0.82;
		const adjustedAlpha = hasBackground ? baseAlpha * 0.5 : baseAlpha;
		background.roundRect(gridOriginX, gridOriginY, gridWidth, gridHeight, 12).fill(0x0b1221).alpha = adjustedAlpha;
		gridLayer.addChild(background);

		const measureTicks = meterConfig.beatsPerMeasure * TICKS_PER_BEAT;
		for (let row = 0; row <= rows.length; row += 1) {
			const y = gridOriginY + row * cellHeight;
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

		if (Number.isInteger(SIXTEENTH_TICK_SIZE)) {
			for (let tick = SIXTEENTH_TICK_SIZE; tick < totalTicks; tick += SIXTEENTH_TICK_SIZE) {
				if (tick % TICKS_PER_BEAT === 0) continue;
				const x = gridOriginX + (tick / totalTicks) * gridWidth;
				const line = new Graphics();
				line
					.moveTo(x, gridOriginY)
					.lineTo(x, gridOriginY + gridHeight)
					.stroke({ color: 0x1c253d, width: 1, alpha: 0.35 });
				gridLayer.addChild(line);
			}
		}
	};

	const renderLabels = () => {
		labelLayer.removeChildren();
		getScaleRows().forEach((label, index) => {
			const text = new Text({ text: label, style: { fill: '#dfe6f2', fontSize: 12, fontFamily: 'Poppins, sans-serif' } });
			text.x = 10;
			text.y = gridOriginY + index * cellHeight + cellHeight / 2 - 8;
			labelLayer.addChild(text);
		});
	};

	const renderNotes = () => {
		noteLayer.removeChildren();
		noteRects.clear();
		const progressSeconds = playheadSeconds;
		notes.forEach((note) => {
			const width = note.durationTicks * pxPerTick;
			const height = noteBlockHeight();
			const x = tickToX(note.startTick);
			const y = noteBlockY(note.rowIndex);
			noteRects.set(note.id, { x, y, width, height });
			const graphic = new Graphics();
			const active = playheadSeconds > 0 && isNoteActive(note, progressSeconds, bpm);
			const isSelected = selectedNoteSet.has(note.id);
			const fillColor = active
				? lightenColor(note.color)
				: isSelected
					? lightenColor(note.color, 0.4)
					: note.color;
			const strokeColor = active ? 0xffffff : isSelected ? 0xffd166 : 0x000000;
			const strokeWidth = active || isSelected ? 2 : 0;
			graphic
				.roundRect(x, y, width, height, 6)
				.fill(fillColor)
				.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeWidth ? 0.9 : 0 });
			graphic.alpha = active || isSelected ? 1 : 0.9;
			graphic.cursor = motifMode ? 'crosshair' : 'pointer';
			graphic.eventMode = motifMode ? 'none' : 'static';
			graphic.on('pointerdown', (event: FederatedPointerEvent) => {
				if (motifMode) return;
				event.stopPropagation();
				if (multiSelectEnabled) {
					if (selectedNoteSet.has(note.id)) {
						startExistingNoteDrag(note, graphic, event);
					} else {
						beginAreaSelection('multi', event);
					}
					return;
				}
				startExistingNoteDrag(note, graphic, event);
			});
			graphic.on('rightdown', () => {
				if (note.groupType === 'triplet-eighth' && note.groupId) {
					dispatch('deleteTripletGroup', { groupId: note.groupId });
				} else {
					dispatch('delete', { noteId: note.id });
				}
			});
			noteLayer.addChild(graphic);
		});
	};

const beginNotePlacement = (
		selection: { definitionId: string; durationTicks: number; color: number },
		event: FederatedPointerEvent
	) => {
		if (motifMode || multiSelectEnabled) return;
		clearExternalPreview();
		const ghost = new Graphics();
		ghost.roundRect(0, 0, selection.durationTicks * pxPerTick, noteBlockHeight(), 6).fill(selection.color, 0.65);
		highlightLayer.addChild(ghost);
		const definition = definitionLookup.get(selection.definitionId);
		const isTriplet = definition?.id === 'triplet-eighth';
		activeDrag = {
			source: 'palette-note',
			definitionId: selection.definitionId,
			durationTicks: selection.durationTicks,
			rowSpan: 1,
			groupType: selection.definitionId === 'triplet-eighth' ? 'triplet-eighth' : undefined,
			groupIndex: selection.definitionId === 'triplet-eighth' ? 0 : null,
			offsetX: ghost.width / 2,
			offsetY: ghost.height / 2,
			ghost,
			limitToBeat: Boolean(isTriplet),
			beatSpanTicks: isTriplet ? TICKS_PER_BEAT : selection.durationTicks
		};
		updateGhostPosition(event.global.x, event.global.y);
	};

	const beginSelectionDrag = (anchor: PlacedNote, event: FederatedPointerEvent) => {
		const selectionNotes = notes.filter((entry) => selectedNoteSet.has(entry.id));
		if (selectionNotes.length < 2) return false;
		const ghost = new Graphics();
		const baseStartTick = anchor.startTick;
		const baseRowIndex = anchor.rowIndex;
		selectionNotes.forEach((entry) => {
			const relX = (entry.startTick - baseStartTick) * pxPerTick;
			const relY = (entry.rowIndex - baseRowIndex) * cellHeight;
			ghost
				.roundRect(relX, relY, entry.durationTicks * pxPerTick, noteBlockHeight(), 6)
				.fill(entry.color, 0.35)
				.stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
		});
		highlightLayer.addChild(ghost);
		activeDrag = {
			source: 'existing-note',
			noteId: anchor.id,
			definitionId: anchor.noteDefinitionId,
			durationTicks: anchor.durationTicks,
			rowSpan: 1,
			offsetX: event.global.x - tickToX(anchor.startTick),
			offsetY: event.global.y - noteBlockY(anchor.rowIndex),
			ghost,
			selectionNotes: selectionNotes.map((entry) => ({
				id: entry.id,
				tickOffset: entry.startTick - baseStartTick,
				rowOffset: entry.rowIndex - baseRowIndex,
				durationTicks: entry.durationTicks,
				color: entry.color,
				groupId: entry.groupId,
				groupType: entry.groupType,
				noteDefinitionId: entry.noteDefinitionId,
				groupIndex: entry.groupIndex ?? null
			})),
			selectionBase: { startTick: baseStartTick, rowIndex: baseRowIndex },
			selectionNoteIds: new Set(selectionNotes.map((entry) => entry.id))
		};
		updateGhostPosition(event.global.x, event.global.y);
		return true;
	};

	const startExistingNoteDrag = (note: PlacedNote, graphic: Graphics, event: FederatedPointerEvent) => {
		if (motifMode) return;
		clearExternalPreview();
		if (multiSelectEnabled && selectedNoteSet.has(note.id) && selectedNoteSet.size > 1) {
			if (beginSelectionDrag(note, event)) return;
		}
		const ghost = new Graphics();
		const isTriplet = note.groupType === 'triplet-eighth' && Boolean(note.groupId);
		const definition = definitionLookup.get(note.noteDefinitionId);
		const definitionLimit = definition?.id === 'triplet-eighth';
		const relatedNotes =
			isTriplet && note.groupId ? notes.filter((entry) => entry.groupId === note.groupId) : [];
		const groupStart = relatedNotes.length
			? Math.min(...relatedNotes.map((entry) => entry.startTick))
			: note.startTick;
		const groupEnd = relatedNotes.length
			? Math.max(...relatedNotes.map((entry) => entry.startTick + entry.durationTicks))
			: note.startTick + note.durationTicks;
		const groupDuration = groupEnd - groupStart;

		if (isTriplet && event.shiftKey && note.groupId) {
			ghost.roundRect(0, 0, groupDuration * pxPerTick, noteBlockHeight(), 6).fill(note.color, 0.45);
			highlightLayer.addChild(ghost);
			activeDrag = {
				source: 'existing-note',
				noteId: note.id,
				groupId: note.groupId,
				groupType: note.groupType,
				groupIndex: note.groupIndex ?? 0,
				durationTicks: groupDuration,
				rowSpan: 1,
				offsetX: event.global.x - tickToX(groupStart),
				offsetY: event.global.y - noteBlockY(note.rowIndex),
				ghost,
				groupMode: 'group',
				limitToBeat: true,
				beatSpanTicks: groupDuration
			};
			updateGhostPosition(event.global.x, event.global.y);
			return;
		}

		const ghostHeight = noteBlockHeight();
		const ghostWidth = note.durationTicks * pxPerTick;
		ghost.roundRect(0, 0, ghostWidth, ghostHeight, 6).fill(note.color, 0.8);
		highlightLayer.addChild(ghost);
		const centerOffsetX = ghostWidth / 2;
		const centerOffsetY = ghostHeight / 2;
		activeDrag = {
			source: 'existing-note',
			noteId: note.id,
			definitionId: note.noteDefinitionId,
			durationTicks: note.durationTicks,
			rowSpan: 1,
			groupType: note.groupType,
			groupIndex: note.groupIndex ?? null,
			offsetX: isTriplet ? 0 : centerOffsetX,
			offsetY: centerOffsetY,
			ghost,
			lockX: Boolean(isTriplet),
			baseStartTick: note.startTick,
			groupId: note.groupId,
			groupMode: isTriplet ? 'single' : undefined,
			limitToBeat: Boolean(definitionLimit && !isTriplet ? true : false),
			beatSpanTicks: definitionLimit ? definition?.durationTicks ?? note.durationTicks : note.durationTicks
		};
		updateGhostPosition(event.global.x, event.global.y);
	};

	const beginMotifPlacement = (motif: Motif, event: FederatedPointerEvent) => {
		if (motifMode) return;
		clearExternalPreview();
		const ghost = new Graphics();
		ghost.roundRect(0, 0, motif.widthTicks * pxPerTick, noteBlockHeight(motif.rowSpan), 8).fill(0xffffff, 0.35);
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
		const desiredX =
			activeDrag.lockX && activeDrag.baseStartTick !== undefined
				? tickToX(activeDrag.baseStartTick)
				: x - activeDrag.offsetX;
		activeDrag.ghost.position.set(desiredX, y - activeDrag.offsetY);

		if (activeDrag.selectionNotes && activeDrag.selectionBase && activeDrag.selectionNoteIds) {
			const candidate = pointerToCandidate(
				x,
				y,
				activeDrag.durationTicks,
				activeDrag.rowSpan,
				activeDrag.offsetX,
				activeDrag.offsetY
			);
			if (!candidate) {
				activeDrag.selectionDelta = null;
				highlightBox.clear();
				return;
			}
			const result = validateSelectionCandidate(candidate, activeDrag);
			activeDrag.selectionDelta = result.valid ? { tickDelta: result.tickDelta, rowDelta: result.rowDelta } : null;
			const color = result.valid ? 0x2ecc71 : 0xe74c3c;
			highlightBox.clear();
			activeDrag.selectionNotes.forEach((note) => {
				const noteStart = candidate.startTick + note.tickOffset;
				const noteRow = candidate.rowIndex + note.rowOffset;
				highlightBox
					.roundRect(
						tickToX(noteStart),
						noteBlockY(noteRow),
						note.durationTicks * pxPerTick,
						noteBlockHeight(),
						8
					)
					.stroke({ color, width: 2, alpha: 0.8 });
			});
			return;
		}

		const candidate = pointerToCandidate(
			x,
			y,
			activeDrag.durationTicks,
			activeDrag.rowSpan,
			activeDrag.offsetX,
			activeDrag.offsetY
		);
		if (!candidate) {
			showHighlight(null, false, activeDrag.rowSpan, activeDrag.durationTicks);
			return;
		}
		if (activeDrag.lockX && activeDrag.baseStartTick !== undefined) {
			candidate.startTick = activeDrag.baseStartTick;
		}
		const collision = rowHasCollision(
			candidate.rowIndex,
			candidate.startTick,
			activeDrag.durationTicks,
			activeDrag.groupMode === 'group' ? undefined : activeDrag.noteId,
			activeDrag.groupMode === 'group' ? activeDrag.groupId : undefined
		);
		const beatValid =
			!activeDrag.limitToBeat ||
			withinSingleBeat(candidate.startTick, activeDrag.beatSpanTicks ?? activeDrag.durationTicks);
		const startsAllowed = isStartAllowed(
			candidate.startTick,
			activeDrag.durationTicks,
			activeDrag.definitionId,
			activeDrag.groupType ?? (activeDrag.groupMode ? 'triplet-eighth' : undefined),
			activeDrag.groupIndex ?? null
		);
		const valid =
			respectsBarlines(candidate.startTick, activeDrag.durationTicks) && !collision && beatValid && startsAllowed;
		showHighlight(candidate, valid, activeDrag.rowSpan, activeDrag.durationTicks);
	};

	const pointerToCandidate = (
		x: number,
		y: number,
		durationTicks: number,
		rowSpan: number,
		offsetX = 0,
		offsetY = 0
	) => {
		if (!isInsideGrid(x, y)) return null;
		const rows = getScaleRows();
		const noteWidth = durationTicks * pxPerTick;
		const noteHeight = noteBlockHeight(rowSpan);
		const anchorX = clamp(x - offsetX, gridOriginX, gridOriginX + gridWidth - noteWidth);
		const anchorY = clamp(
			y - offsetY,
			gridOriginY + NOTE_VERTICAL_PADDING,
			gridOriginY + gridHeight - NOTE_VERTICAL_PADDING - noteHeight
		);
		const relativeX = anchorX - gridOriginX;
		const relativeY = anchorY - gridOriginY;
		const rowIndex = Math.floor(relativeY / cellHeight);
		if (rowIndex < 0 || rowIndex + rowSpan > rows.length) return null;
		const rawTick = Math.round(relativeX / pxPerTick);
		const snappedTick = quantizeTick(rawTick);
		const startTick = Math.max(0, Math.min(snappedTick, totalTicks - durationTicks));
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
		highlightBox
			.roundRect(
				tickToX(candidate.startTick),
				noteBlockY(candidate.rowIndex),
				durationTicks * pxPerTick,
				noteBlockHeight(rowSpan),
				8
			)
			.stroke({ color, width: 2, alpha: 0.9 });
	};

const beginAreaSelection = (mode: 'motif' | 'multi', event: FederatedPointerEvent) => {
		selectionContext = mode;
		selectionStart = { x: event.global.x, y: event.global.y };
		const strokeColor = mode === 'motif' ? 0xf4d03f : 0x8ab4ff;
		const fillColor = mode === 'motif' ? 0xf4d03f : 0x8ab4ff;
		selectionOutline.clear();
		selectionFill.clear();
		selectionOutline.stroke({ color: strokeColor, width: 2 });
		selectionFill.fill(fillColor, mode === 'motif' ? 0.08 : 0.15);
		selectionOutline.visible = true;
		selectionFill.visible = true;
	};

	const handlePointerDown = (event: FederatedPointerEvent) => {
		const inside = isInsideGrid(event.global.x, event.global.y);
		if (!inside) return;
		if (motifMode) {
			beginAreaSelection('motif', event);
			return;
		}
		if (multiSelectEnabled) {
			beginAreaSelection('multi', event);
			return;
		}
		if (selectedNoteDefinition) {
			beginNotePlacement(selectedNoteDefinition, event);
			return;
		}
		if (selectedMotifId) {
			const motif = motifs.find((entry) => entry.id === selectedMotifId);
			if (motif) {
				beginMotifPlacement(motif, event);
			}
			return;
		}
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
		const candidate = pointerToCandidate(
			event.global.x,
			event.global.y,
			activeDrag?.durationTicks ?? 0,
			activeDrag?.rowSpan ?? 1,
			activeDrag?.offsetX ?? 0,
			activeDrag?.offsetY ?? 0
		);
		if (activeDrag?.selectionNotes && activeDrag.selectionNoteIds) {
			const result = validateSelectionCandidate(candidate, activeDrag);
			if (result.valid) {
				dispatch('moveSelection', {
					noteIds: Array.from(activeDrag.selectionNoteIds),
					tickDelta: result.tickDelta,
					rowDelta: result.rowDelta
				});
			}
			cleanupDrag();
			return;
		}
		if (activeDrag?.source === 'existing-note' && !candidate) {
			if (activeDrag.groupId && (activeDrag.groupMode === 'group' || activeDrag.groupMode === 'single')) {
				dispatch('deleteTripletGroup', { groupId: activeDrag.groupId });
			} else if (activeDrag.groupMode === 'group' && activeDrag.groupId) {
				dispatch('deleteTripletGroup', { groupId: activeDrag.groupId });
			} else {
				deleteNoteAtPointer(event);
			}
		}
		if (!activeDrag) return;
		if (candidate) {
			if (activeDrag.groupMode === 'group' && activeDrag.groupId) {
				dispatch('moveTripletGroup', {
					groupId: activeDrag.groupId,
					startTick: candidate.startTick
				});
			} else if (activeDrag.groupMode === 'single' && activeDrag.noteId) {
				dispatch('moveTripletMember', {
					noteId: activeDrag.noteId,
					rowIndex: candidate.rowIndex
				});
			} else if (activeDrag.source === 'existing-note' && activeDrag.noteId) {
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
		selectionOutline.visible = false;
		selectionFill.visible = false;
	};

	const deleteNoteAtPointer = (event: FederatedPointerEvent) => {
		if (!activeDrag || activeDrag.source !== 'existing-note' || !activeDrag.noteId) return;
		if (isInsideGrid(event.global.x, event.global.y)) return;
		dispatch('delete', { noteId: activeDrag.noteId });
	};

	const updateSelectionRect = (x: number, y: number) => {
		if (!selectionStart) return;
		const rect = normalizeRect(selectionStart.x, selectionStart.y, x, y);
		selectionOutline.clear();
		selectionFill.clear();
		const strokeColor = selectionContext === 'motif' ? 0xf4d03f : 0x8ab4ff;
		const fillColor = selectionContext === 'motif' ? 0xf4d03f : 0x8ab4ff;
		selectionOutline.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: strokeColor, width: 2 });
		selectionFill.rect(rect.x, rect.y, rect.width, rect.height).fill(fillColor, selectionContext === 'motif' ? 0.08 : 0.15);
	};

	const finalizeSelection = (x: number, y: number) => {
		if (!selectionStart) return;
		selectionOutline.clear();
		selectionFill.clear();
		selectionOutline.visible = false;
		selectionFill.visible = false;
		const rect = normalizeRect(selectionStart.x, selectionStart.y, x, y);
		selectionStart = null;
		const intent = selectionContext;
		selectionContext = null;
		const selected: string[] = [];
		noteRects.forEach((bounds, noteId) => {
			if (rectsIntersect(rect, bounds)) selected.push(noteId);
		});
		if (!selected.length) return;
		if (intent === 'motif') {
			dispatch('motifSelection', { noteIds: selected });
		} else if (intent === 'multi') {
			dispatch('noteSelection', { noteIds: selected });
		}
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

const rowHasCollision = (
	rowIndex: number,
	startTick: number,
	durationTicks: number,
	ignoreId?: string | Set<string>,
	ignoreGroupId?: string
) => {
	const candidateEnd = startTick + durationTicks;
	return notes.some((note) => {
		if (note.rowIndex !== rowIndex) return false;
			if (ignoreId) {
				if (ignoreId instanceof Set) {
					if (ignoreId.has(note.id)) return false;
				} else if (note.id === ignoreId) {
					return false;
				}
			}
			if (ignoreGroupId && note.groupId && note.groupId === ignoreGroupId) return false;
			const noteEnd = note.startTick + note.durationTicks;
			return !(candidateEnd <= note.startTick || startTick >= noteEnd);
		});
	};

	const validateSelectionCandidate = (
		candidate: { rowIndex: number; startTick: number } | null,
		drag: ActiveDrag
	) => {
		if (!candidate || !drag.selectionNotes || !drag.selectionBase || !drag.selectionNoteIds) {
			return { valid: false, tickDelta: 0, rowDelta: 0 };
		}
		const rows = getScaleRows();
		const rowDelta = candidate.rowIndex - drag.selectionBase.rowIndex;
		const tickDelta = candidate.startTick - drag.selectionBase.startTick;
		const tripletSpans = new Map<string, { min: number; max: number }>();
		for (const note of drag.selectionNotes) {
			const newRow = note.rowOffset + candidate.rowIndex;
			const newStart = note.tickOffset + candidate.startTick;
			if (newRow < 0 || newRow >= rows.length) {
				return { valid: false, tickDelta, rowDelta };
			}
			if (!respectsBarlines(newStart, note.durationTicks)) {
				return { valid: false, tickDelta, rowDelta };
			}
			if (rowHasCollision(newRow, newStart, note.durationTicks, drag.selectionNoteIds, note.groupId ?? undefined)) {
				return { valid: false, tickDelta, rowDelta };
			}
			if (!isStartAllowed(newStart, note.durationTicks, note.noteDefinitionId, note.groupType, note.groupIndex)) {
				return { valid: false, tickDelta, rowDelta };
			}
			if (note.groupType === 'triplet-eighth' && note.groupId) {
				const entry = tripletSpans.get(note.groupId) ?? { min: Infinity, max: -Infinity };
				entry.min = Math.min(entry.min, newStart);
				entry.max = Math.max(entry.max, newStart + note.durationTicks);
				tripletSpans.set(note.groupId, entry);
			}
		}
		for (const span of tripletSpans.values()) {
			const spanTicks = span.max - span.min;
			if (!withinSingleBeat(span.min, spanTicks)) {
				return { valid: false, tickDelta, rowDelta };
			}
		}
		return { valid: true, tickDelta, rowDelta };
	};

	const isInsideGrid = (x: number, y: number) =>
		x >= gridOriginX && x <= gridOriginX + gridWidth && y >= gridOriginY && y <= gridOriginY + gridHeight;

	const tickToX = (tick: number) => gridOriginX + tick * pxPerTick;
const rowToY = (rowIndex: number) => gridOriginY + rowIndex * cellHeight;

const clientToCanvasPoint = (clientX: number, clientY: number) => {
	if (!canvas) return null;
	const rect = canvas.getBoundingClientRect();
	const x = clientX - rect.left;
	const y = clientY - rect.top;
	const scaleX = canvasWidth ? canvasWidth / rect.width : 1;
	const scaleY = canvasHeight ? canvasHeight / rect.height : 1;
	return { x: x * scaleX, y: y * scaleY };
};

type SidebarDropRequest =
	| { type: 'note'; payload: { definitionId: string; durationTicks: number; color: number } }
	| { type: 'motif'; payload: { motifId: string; durationTicks: number; rowSpan: number } };

let externalPreview: {
	ghost: Graphics;
	type: SidebarDropRequest['type'];
	durationTicks: number;
	rowSpan: number;
} | null = null;

export function previewSidebarDrop(request: SidebarDropRequest | null, point: { clientX: number; clientY: number }) {
	if (!request || activeDrag || multiSelectEnabled) return false;
	const coords = clientToCanvasPoint(point.clientX, point.clientY);
	if (!coords) {
		clearExternalPreview();
		return false;
	}
	const durationTicks = request.payload.durationTicks;
	const rowSpan = request.type === 'note' ? 1 : request.payload.rowSpan;
	const candidate = pointerToCandidate(
		coords.x,
		coords.y,
		durationTicks,
		rowSpan,
		(durationTicks * pxPerTick) / 2,
		noteBlockHeight(rowSpan) / 2
	);
	if (!candidate) {
		clearExternalPreview();
		highlightBox.clear();
		return false;
	}
	const collision =
		request.type === 'note'
			? rowHasCollision(candidate.rowIndex, candidate.startTick, durationTicks)
			: [...Array(rowSpan).keys()].some((offset) =>
					rowHasCollision(candidate.rowIndex + offset, candidate.startTick, durationTicks)
			  );
	const startsAllowed =
		request.type === 'note'
			? isStartAllowed(candidate.startTick, durationTicks, request.payload.definitionId, undefined, 0)
			: true;
	const valid = respectsBarlines(candidate.startTick, durationTicks) && !collision && startsAllowed;
	showHighlight(candidate, valid, rowSpan, durationTicks);
	if (!valid) {
		clearExternalPreview();
		return false;
	}
	updateExternalGhost(request, durationTicks, rowSpan, candidate);
	return true;
}

export function clearSidebarPreview() {
	clearExternalPreview();
	if (!activeDrag) {
		highlightBox.clear();
	}
}

const updateExternalGhost = (
	request: SidebarDropRequest,
	durationTicks: number,
	rowSpan: number,
	position: { rowIndex: number; startTick: number }
) => {
	const needsNewGhost =
		!externalPreview ||
		externalPreview.type !== request.type ||
		externalPreview.durationTicks !== durationTicks ||
		externalPreview.rowSpan !== rowSpan;
	if (needsNewGhost) {
		externalPreview?.ghost.destroy();
		const ghost = new Graphics();
		const height = noteBlockHeight(rowSpan);
		const fillColor = request.type === 'note' ? request.payload.color : 0xffffff;
		ghost.roundRect(0, 0, durationTicks * pxPerTick, height, 6).fill(fillColor, request.type === 'note' ? 0.55 : 0.35);
		highlightLayer.addChild(ghost);
		externalPreview = { ghost, type: request.type, durationTicks, rowSpan };
	}
	externalPreview?.ghost.position.set(tickToX(position.startTick), noteBlockY(position.rowIndex));
};

const clearExternalPreview = () => {
	if (externalPreview) {
		externalPreview.ghost.destroy();
		externalPreview = null;
	}
};

export function handleSidebarDrop(request: SidebarDropRequest | null, point: { clientX: number; clientY: number }) {
	if (!request || multiSelectEnabled) return false;
	const coords = clientToCanvasPoint(point.clientX, point.clientY);
	if (!coords) return false;
	const durationTicks = request.payload.durationTicks;
	const rowSpan = request.type === 'note' ? 1 : request.payload.rowSpan;
	const candidate = pointerToCandidate(
		coords.x,
		coords.y,
		durationTicks,
		rowSpan,
		(durationTicks * pxPerTick) / 2,
		noteBlockHeight(rowSpan) / 2
	);
	if (!candidate) {
		clearExternalPreview();
		return false;
	}
	const collisionDetected =
		request.type === 'note'
			? rowHasCollision(candidate.rowIndex, candidate.startTick, durationTicks)
			: [...Array(rowSpan).keys()].some((offset) =>
					rowHasCollision(candidate.rowIndex + offset, candidate.startTick, durationTicks)
			  );
	if (collisionDetected || !respectsBarlines(candidate.startTick, durationTicks)) {
		clearExternalPreview();
		return false;
	}
	if (request.type === 'note') {
		const startsAllowed = isStartAllowed(candidate.startTick, durationTicks, request.payload.definitionId, undefined, 0);
		if (!startsAllowed) {
			clearExternalPreview();
			return false;
		}
	}
	if (request.type === 'note') {
		dispatch('place', {
			definitionId: request.payload.definitionId,
			startTick: candidate.startTick,
			rowIndex: candidate.rowIndex,
			durationTicks
		});
	} else {
		dispatch('placeMotif', {
			motifId: request.payload.motifId,
			startTick: candidate.startTick,
			rowIndex: candidate.rowIndex
		});
	}
	clearExternalPreview();
	return true;
}

	$: if (app?.renderer) {
		meter;
		scale;
		bpm;
		calculateMetrics();
		app.renderer.resize(canvasWidth, canvasHeight);
		renderGrid();
		renderLabels();
		renderNotes();
	}

$: if (app) {
		meter;
		scale;
		updateSceneLayout();
	}

	$: if (app?.renderer) {
		notes;
		playheadSeconds;
		motifMode;
		selectedNoteIds;
		renderNotes();
	}

	$: if (app && !motifMode && !multiSelectEnabled) {
		selectionOutline?.clear();
		selectionFill?.clear();
		if (selectionOutline) selectionOutline.visible = false;
		if (selectionFill) selectionFill.visible = false;
		selectionStart = null;
		selectionContext = null;
	}
</script>

<div class="grid-shell" bind:this={host} class:has-background={hasBackground} style={gridShellStyle}></div>

<style>
	.grid-shell {
		position: relative;
		width: 100%;
		height: 100%;
		padding: 0.25rem;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
		overflow: hidden;
		display: flex;
	}

	.grid-shell::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 20px;
		background-size: cover;
		background-position: center;
		opacity: 0;
		transition: opacity 0.2s ease;
		pointer-events: none;
	}

	.grid-shell.has-background::before {
		opacity: 0.4;
		background-image: var(--grid-bg);
	}

	:global(.grid-shell canvas) {
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
		border-radius: 16px;
		position: relative;
		z-index: 1;
	}
</style>
