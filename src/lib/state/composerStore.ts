import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import {
	DEFAULT_TEMPO,
	METERS,
	NOTE_PALETTE,
	SCALES,
	TEMPOS
} from '$lib/constants/music';
import type {
	ComposerState,
	MeterId,
	Motif,
	NoteDefinition,
	PlacementCandidate,
	PlacementValidation,
	ScaleId,
	TempoId,
	PlacedNote
} from '$lib/types/composer';
import { TICKS_PER_BEAT } from '$lib/types/composer';
import { validatePlacement } from '$lib/utils/placement';

export const AUTOSAVE_KEY = 'compose-it-autosave-v1';
export const FORCE_CLEAR_FLAG = 'compose-it-force-clear';

const baseState = (): ComposerState => ({
	meter: '4/4',
	scaleId: 'c-major',
	tempo: DEFAULT_TEMPO,
	notes: [],
	motifs: [],
	updatedAt: Date.now(),
	compositionName: 'Untitled',
	backgroundImage: undefined
});

const alignNotesWithScale = (notes: PlacedNote[], scaleId: ScaleId) => {
	const rows = SCALES[scaleId].rows;
	return notes.map((note) => {
		const idx = rows.indexOf(note.pitch);
		return idx === -1 ? note : { ...note, rowIndex: idx };
	});
};

const safeParse = (value: string | null): ComposerState | null => {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as ComposerState;
		if (!parsed.meter || !parsed.scaleId) return null;
		return {
			...baseState(),
			...parsed,
			notes: alignNotesWithScale(parsed.notes ?? [], parsed.scaleId),
			motifs: parsed.motifs ?? []
		};
	} catch (error) {
		console.error('Failed to parse autosave', error);
		return null;
	}
};

const loadInitialState = () => {
	if (!browser) return baseState();
	try {
		if (sessionStorage.getItem(FORCE_CLEAR_FLAG)) {
			sessionStorage.removeItem(FORCE_CLEAR_FLAG);
			localStorage.removeItem(AUTOSAVE_KEY);
			return baseState();
		}
	} catch (error) {
		console.warn('Unable to inspect sessionStorage for hard reload flag', error);
	}
	return safeParse(localStorage.getItem(AUTOSAVE_KEY)) ?? baseState();
};

const persist = (state: ComposerState) => {
	if (browser) {
		localStorage.setItem(
			AUTOSAVE_KEY,
			JSON.stringify({
				...state,
				notes: state.notes,
				motifs: state.motifs
			})
		);
	}
	return state;
};

const findNoteDefinition = (id: string): NoteDefinition | undefined =>
	NOTE_PALETTE.find((note) => note.id === id);

const spansSingleBeat = (startTick: number, spanTicks: number) => {
	if (spanTicks <= 0) return true;
	const beatTicks = TICKS_PER_BEAT;
	const endTick = startTick + spanTicks - 1;
	return Math.floor(startTick / beatTicks) === Math.floor(endTick / beatTicks);
};
const selectionHasCompleteTriplets = (ids: Set<string>, notes: PlacedNote[]) => {
	const groupCache = new Map<string, PlacedNote[]>();
	const getGroupMembers = (groupId: string) => {
		if (!groupCache.has(groupId)) {
			groupCache.set(
				groupId,
				notes.filter((note) => note.groupId === groupId)
			);
		}
		return groupCache.get(groupId) ?? [];
	};
	for (const note of notes) {
		if (note.groupType === 'triplet-eighth' && note.groupId && ids.has(note.id)) {
			const members = getGroupMembers(note.groupId);
			if (!members.every((entry) => ids.has(entry.id))) {
				return false;
			}
		}
	}
	return true;
};

const touch = (state: ComposerState): ComposerState => ({ ...state, updatedAt: Date.now() });

export type PlacementActionResult = PlacementValidation & { noteId?: string };

export const createComposerStore = () => {
	const store = writable<ComposerState>(loadInitialState());

	const setAndPersist = (value: ComposerState) => store.set(persist(value));

	return {
		subscribe: store.subscribe,
		initializeSelection: (meter: MeterId, scaleId: ScaleId) => {
			const next = touch({
				...baseState(),
				meter,
				scaleId,
				tempo: DEFAULT_TEMPO
			});
			setAndPersist(next);
		},
		setMeter: (meter: MeterId) => {
			setAndPersist(
				touch({
					...get(store),
					meter,
					notes: []
				})
			);
		},
		setScale: (scaleId: ScaleId) => {
			setAndPersist(
				touch({
					...get(store),
					scaleId,
					notes: []
				})
			);
		},
		setTempo: (tempo: TempoId) => {
			setAndPersist(touch({ ...get(store), tempo }));
		},
		setBackgroundImage: (dataUrl?: string) => {
			setAndPersist(touch({ ...get(store), backgroundImage: dataUrl }));
		},
		setCompositionName: (name: string) => {
			setAndPersist(touch({ ...get(store), compositionName: name }));
		},
		clear: () => {
			const current = get(store);
			setAndPersist(touch({ ...current, notes: [] }));
		},
		placeNote: (definitionId: string, candidate: PlacementCandidate): PlacementActionResult => {
			const current = get(store);
			const definition = findNoteDefinition(definitionId);
			if (!definition) return { ok: false, reason: 'Unknown note' };
			if (definition.restrictTo && !definition.restrictTo.includes(current.meter)) {
				return { ok: false, reason: 'Not allowed in this meter' };
			}

			const rows = SCALES[current.scaleId].rows;
			const pitch = rows[candidate.rowIndex];
			if (!pitch) {
				return { ok: false, reason: 'Row unavailable in scale' };
			}

			// Special handling for triplet placements: expand into three linked notes.
			if (definition.id === 'triplet-eighth') {
				const tripletSpan = definition.durationTicks * 3;
				if (!spansSingleBeat(candidate.startTick, tripletSpan)) {
					return { ok: false, reason: 'Triplets must stay within a beat' };
				}

				const offsets = [0, definition.durationTicks, definition.durationTicks * 2];
				const previewNotes = [...current.notes];
				for (const offset of offsets) {
					const individualCandidate = {
						rowIndex: candidate.rowIndex,
						startTick: candidate.startTick + offset,
						durationTicks: definition.durationTicks
					};
					const validation = validatePlacement({
						meter: current.meter,
						notes: previewNotes,
						candidate: individualCandidate
					});
					if (!validation.ok) return validation;
					previewNotes.push({
						id: crypto.randomUUID(),
						noteDefinitionId: definition.id,
						rowIndex: individualCandidate.rowIndex,
						startTick: individualCandidate.startTick,
						durationTicks: individualCandidate.durationTicks,
						color: definition.color,
						pitch
					});
				}

				const groupId = crypto.randomUUID();
				const tripletNotes = offsets.map((offset, index) => ({
					id: crypto.randomUUID(),
					noteDefinitionId: definition.id,
					rowIndex: candidate.rowIndex,
					startTick: candidate.startTick + offset,
					durationTicks: definition.durationTicks,
					color: definition.color,
					pitch,
					groupId,
					groupType: 'triplet-eighth' as const,
					groupIndex: index,
					groupSize: offsets.length
				}));

				setAndPersist(
					touch({
						...current,
						notes: [...current.notes, ...tripletNotes]
					})
				);

				return { ok: true, noteId: tripletNotes[0].id };
			}

			const validation = validatePlacement({
				meter: current.meter,
				notes: current.notes,
				candidate
			});

			if (!validation.ok) return validation;

			const noteId = crypto.randomUUID();
			const newNote = {
				id: noteId,
				noteDefinitionId: definition.id,
				rowIndex: candidate.rowIndex,
				startTick: candidate.startTick,
				durationTicks: candidate.durationTicks,
				color: definition.color,
				pitch
			};

			setAndPersist(
				touch({
					...current,
					notes: [...current.notes, newNote]
				})
			);

			return { ok: true, noteId };
		},
		moveNote: (noteId: string, candidate: PlacementCandidate): PlacementActionResult => {
			const current = get(store);
			const note = current.notes.find((n) => n.id === noteId);
			if (!note) return { ok: false, reason: 'Missing note' };

			const validation = validatePlacement({
				meter: current.meter,
				notes: current.notes,
				candidate,
				ignoreNoteId: noteId
			});

			if (!validation.ok) return validation;

			const rows = SCALES[current.scaleId].rows;
			if (!rows[candidate.rowIndex]) {
				return { ok: false, reason: 'Row unavailable' };
			}

			const updatedNotes = current.notes.map((entry) =>
				entry.id === noteId
					? {
						...entry,
						rowIndex: candidate.rowIndex,
						startTick: candidate.startTick,
						durationTicks: candidate.durationTicks,
						pitch: rows[candidate.rowIndex]
					}
					: entry
			);

			setAndPersist(touch({ ...current, notes: updatedNotes }));
			return { ok: true, noteId };
		},
		moveTripletGroup: (groupId: string, newStartTick: number): PlacementActionResult => {
			const current = get(store);
			const groupNotes = current.notes.filter((note) => note.groupId === groupId);
			if (!groupNotes.length) return { ok: false, reason: 'Missing triplet' };

			const sorted = [...groupNotes].sort(
				(a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0)
			);
			const firstNote = sorted[0];
			const delta = newStartTick - firstNote.startTick;
			const lastNote = sorted[sorted.length - 1];
			const spanTicks = lastNote.startTick + lastNote.durationTicks - firstNote.startTick;
			if (!spansSingleBeat(newStartTick, spanTicks)) {
				return { ok: false, reason: 'Triplets must stay within a beat' };
			}

			for (const note of sorted) {
				const validation = validatePlacement({
					meter: current.meter,
					notes: current.notes,
					candidate: {
						rowIndex: note.rowIndex,
						startTick: note.startTick + delta,
						durationTicks: note.durationTicks
					},
					ignoreNoteId: note.id
				});
				if (!validation.ok) return validation;
			}

			const updated = current.notes.map((note) =>
				note.groupId === groupId
					? {
							...note,
							startTick: note.startTick + delta
					  }
					: note
			);

			setAndPersist(touch({ ...current, notes: updated }));
			return { ok: true };
		},
		moveNotesGroup: (noteIds: string[], tickDelta: number, rowDelta: number): PlacementActionResult => {
			if (!noteIds.length) return { ok: false, reason: 'No notes selected' };
			const current = get(store);
			const idSet = new Set(noteIds);
			const selection = current.notes.filter((note) => idSet.has(note.id));
			if (!selection.length) return { ok: false, reason: 'Missing notes' };
			if (!selectionHasCompleteTriplets(idSet, current.notes)) {
				return { ok: false, reason: 'Select entire triplet group' };
			}
			const rows = SCALES[current.scaleId].rows;
			const stationary = current.notes.filter((note) => !idSet.has(note.id));
			const scratch: PlacedNote[] = [...stationary];
			const nextById = new Map<string, PlacedNote>();

			for (const note of selection) {
				const newRow = note.rowIndex + rowDelta;
				const newStart = note.startTick + tickDelta;
				if (newRow < 0 || newRow >= rows.length) {
					return { ok: false, reason: 'Row unavailable' };
				}
				const candidate: PlacementCandidate = {
					rowIndex: newRow,
					startTick: newStart,
					durationTicks: note.durationTicks
				};
				const validation = validatePlacement({
					meter: current.meter,
					notes: scratch,
					candidate
				});
				if (!validation.ok) return validation;
				const updatedNote: PlacedNote = {
					...note,
					rowIndex: newRow,
					startTick: newStart,
					pitch: rows[newRow]
				};
				scratch.push(updatedNote);
				nextById.set(note.id, updatedNote);
			}

			const tripletBounds = new Map<string, { min: number; max: number }>();
			for (const note of selection) {
				if (note.groupType === 'triplet-eighth' && note.groupId) {
					const updated = nextById.get(note.id);
					if (!updated) continue;
					const entry = tripletBounds.get(note.groupId) ?? { min: Infinity, max: -Infinity };
					entry.min = Math.min(entry.min, updated.startTick);
					entry.max = Math.max(entry.max, updated.startTick + updated.durationTicks);
					tripletBounds.set(note.groupId, entry);
				}
			}
			for (const { min, max } of tripletBounds.values()) {
				if (!spansSingleBeat(min, max - min)) {
					return { ok: false, reason: 'Triplets must stay within a beat' };
				}
			}

			const updatedNotes = current.notes.map((note) => nextById.get(note.id) ?? note);
			setAndPersist(touch({ ...current, notes: updatedNotes }));
			return { ok: true };
		},
		removeNote: (noteId: string) => {
			const current = get(store);
			setAndPersist(
				touch({ ...current, notes: current.notes.filter((note) => note.id !== noteId) })
			);
		},
		removeNotes: (noteIds: string[]) => {
			if (!noteIds.length) return;
			const ids = new Set(noteIds);
			const current = get(store);
			setAndPersist(touch({ ...current, notes: current.notes.filter((note) => !ids.has(note.id)) }));
		},
		removeTripletGroup: (groupId: string) => {
			const current = get(store);
			setAndPersist(
				touch({
					...current,
					notes: current.notes.filter((note) => note.groupId !== groupId)
				})
			);
		},
		createMotifFromNotes: (noteIds: string[], name: string): Motif | null => {
			const current = get(store);
			const selection = current.notes.filter((note) => noteIds.includes(note.id));
			if (!selection.length) return null;

			const minTick = Math.min(...selection.map((note) => note.startTick));
			const minRow = Math.min(...selection.map((note) => note.rowIndex));
			const maxTick = Math.max(...selection.map((note) => note.startTick + note.durationTicks));
			const maxRow = Math.max(...selection.map((note) => note.rowIndex));

			const motif: Motif = {
				id: crypto.randomUUID(),
				name,
				notes: selection.map((note) => ({
					noteDefinitionId: note.noteDefinitionId,
					rowOffset: note.rowIndex - minRow,
					startTickOffset: note.startTick - minTick,
					durationTicks: note.durationTicks,
					groupKey: note.groupId,
					groupType: note.groupType,
					groupIndex: note.groupIndex,
					groupSize: note.groupSize
				})),
				widthTicks: maxTick - minTick,
				rowSpan: maxRow - minRow + 1
			};

			setAndPersist(touch({ ...current, motifs: [...current.motifs, motif] }));
			return motif;
		},
		placeMotif: (motifId: string, startTick: number, rowIndex: number): PlacementValidation => {
			const current = get(store);
			const motif = current.motifs.find((entry) => entry.id === motifId);
			if (!motif) return { ok: false, reason: 'Missing motif' };

			const targetRows = SCALES[current.scaleId].rows;
			if (rowIndex + motif.rowSpan > targetRows.length) {
				return { ok: false, reason: 'Motif exceeds scale range' };
			}

			type GroupExtras = Partial<Pick<PlacedNote, 'groupId' | 'groupType' | 'groupIndex' | 'groupSize'>>;
			const projectedNotes: PlacedNote[] = [...current.notes];
			const additions: PlacedNote[] = [];

			const scheduleNote = (
				definition: NoteDefinition,
				rowOffset: number,
				startOffset: number,
				durationTicks: number,
				extras: GroupExtras = {}
			): PlacementValidation => {
				const absoluteRow = rowIndex + rowOffset;
				const pitch = targetRows[absoluteRow];
				if (!pitch) {
					return { ok: false, reason: 'Motif exceeds scale range' };
				}
				const candidate: PlacementCandidate = {
					rowIndex: absoluteRow,
					startTick: startTick + startOffset,
					durationTicks
				};
				const validation = validatePlacement({
					meter: current.meter,
					notes: projectedNotes,
					candidate
				});
				if (!validation.ok) return validation;
				const note: PlacedNote = {
					id: crypto.randomUUID(),
					noteDefinitionId: definition.id,
					rowIndex: candidate.rowIndex,
					startTick: candidate.startTick,
					durationTicks: candidate.durationTicks,
					color: definition.color,
					pitch,
					...extras
				};
				projectedNotes.push(note);
				additions.push(note);
				return { ok: true };
			};

			const processedTripletGroups = new Set<string>();

			for (const motifNote of motif.notes) {
				if (motifNote.groupType === 'triplet-eighth' && motifNote.groupKey) {
					if (processedTripletGroups.has(motifNote.groupKey)) continue;
					processedTripletGroups.add(motifNote.groupKey);
					const members = motif.notes
						.filter((entry) => entry.groupKey === motifNote.groupKey)
						.sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
					if (!members.length) continue;
					const firstOffset = Math.min(...members.map((member) => member.startTickOffset));
					const lastOffset = Math.max(
						...members.map((member) => member.startTickOffset + member.durationTicks)
					);
					const spanTicks = lastOffset - firstOffset;
					if (!spansSingleBeat(startTick + firstOffset, spanTicks)) {
						return { ok: false, reason: 'Triplets must stay within a beat' };
					}
					const newGroupId = crypto.randomUUID();
					for (const [memberIndex, member] of members.entries()) {
						const definition = findNoteDefinition(member.noteDefinitionId);
						if (!definition) return { ok: false, reason: 'Unknown note' };
						const placement = scheduleNote(definition, member.rowOffset, member.startTickOffset, member.durationTicks, {
							groupId: newGroupId,
							groupType: 'triplet-eighth',
							groupIndex: member.groupIndex ?? memberIndex,
							groupSize: member.groupSize ?? members.length
						});
						if (!placement.ok) return placement;
					}
					continue;
				}

				const definition = findNoteDefinition(motifNote.noteDefinitionId);
				if (!definition) return { ok: false, reason: 'Unknown note' };
				if (
					definition.id === 'triplet-eighth' &&
					!spansSingleBeat(startTick + motifNote.startTickOffset, motifNote.durationTicks)
				) {
					return { ok: false, reason: 'Triplets must stay within a beat' };
				}
				const placement = scheduleNote(
					definition,
					motifNote.rowOffset,
					motifNote.startTickOffset,
					motifNote.durationTicks
				);
				if (!placement.ok) return placement;
			}

			setAndPersist(touch({ ...current, notes: [...current.notes, ...additions] }));
			return { ok: true };
		},
		removeMotif: (motifId: string) => {
			const current = get(store);
			setAndPersist(touch({ ...current, motifs: current.motifs.filter((motif) => motif.id !== motifId) }));
		},
		importState: (payload: ComposerState) => {
			const meter = METERS[payload.meter] ? payload.meter : '4/4';
			const scaleId = SCALES[payload.scaleId] ? payload.scaleId : 'c-major';
			const tempo = TEMPOS.find((entry) => entry.id === payload.tempo) ? payload.tempo : DEFAULT_TEMPO;
			const sanitized: ComposerState = {
				...baseState(),
				...payload,
				meter,
				scaleId,
				tempo,
				notes: alignNotesWithScale(payload.notes ?? [], scaleId),
				motifs: payload.motifs ?? []
			};
			setAndPersist(touch(sanitized));
		},
		exportState: () => JSON.stringify(get(store), null, 2)
	};
};

export const composerStore = createComposerStore();
