import jsPDF from 'jspdf';
import type { ComposerState } from '$lib/types/composer';
import { METERS, SCALES } from '$lib/constants/music';
import { TICKS_PER_BEAT } from '$lib/types/composer';
import { downloadBlob } from './download';

const slugify = (value: string) =>
	(
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '') || 'compose-it'
	).slice(0, 48);

const pitchOffsets: Record<string, number> = {
	C: 0,
	'C#': 1,
	Db: 1,
	D: 2,
	'D#': 3,
	Eb: 3,
	E: 4,
	F: 5,
	'F#': 6,
	Gb: 6,
	G: 7,
	'G#': 8,
	Ab: 8,
	A: 9,
	'A#': 10,
	Bb: 10,
	B: 11
};

const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const referenceStep = 4 * 7 + letters.indexOf('E'); // E4 bottom line of treble staff

const pitchToMidi = (pitch: string) => {
	const match = pitch.match(/([A-G](?:#|b)?)(\d)/i);
	if (!match) return 60;
	const [, note, octave] = match;
	const semitone = pitchOffsets[note.toUpperCase()] ?? 0;
	return (parseInt(octave, 10) + 1) * 12 + semitone;
};

const pitchToStaffSteps = (pitch: string) => {
	const match = pitch.match(/([A-G])(?:#|b)?(\d)/i);
	if (!match) return 0;
	const [, letterRaw, octaveRaw] = match;
	const letter = letterRaw.toUpperCase();
	const octave = parseInt(octaveRaw, 10);
	const step = octave * 7 + letters.indexOf(letter);
	return step - referenceStep;
};

export const exportGridPdf = (imageDataUrl: string, state: ComposerState) => {
	const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const horizontalMargin = 48;
	const cardPadding = 28;
	const title = state.compositionName || 'Compose-It';

	// background wash
	pdf.setFillColor(10, 14, 36);
	pdf.rect(0, 0, pageWidth, pageHeight, 'F');

	// header
	pdf.setTextColor(255, 255, 255);
	pdf.setFont('helvetica', 'bold');
	pdf.setFontSize(26);
	pdf.text(title, horizontalMargin, 60);
	pdf.setDrawColor(255, 209, 102);
	pdf.setLineWidth(1);
	pdf.line(horizontalMargin, 68, pageWidth - horizontalMargin, 68);

	pdf.setFont('helvetica', 'normal');
	pdf.setFontSize(12);
	pdf.setTextColor(194, 204, 232);
	const preparedOn = new Date().toLocaleDateString();
	pdf.text(`Prepared ${preparedOn}`, horizontalMargin, 86);

	// metadata chips
	const scaleLabel = SCALES[state.scaleId]?.label ?? state.scaleId;
	const metaEntries = [
		{ label: 'Meter', value: state.meter },
		{ label: 'Scale', value: scaleLabel },
		{ label: 'Tempo', value: state.tempo },
		{ label: 'Notes', value: `${state.notes.length}` }
	];
	let chipX = horizontalMargin;
	let chipY = 108;
	pdf.setFontSize(11);
	metaEntries.forEach((entry) => {
		const text = `${entry.label}: ${entry.value}`;
		const chipWidth = pdf.getTextWidth(text) + 18;
		const maxWidth = pageWidth - horizontalMargin;
		if (chipX + chipWidth > maxWidth) {
			chipX = horizontalMargin;
			chipY += 28;
		}
		pdf.setFillColor(22, 28, 56);
		pdf.setDrawColor(49, 64, 118);
		pdf.roundedRect(chipX, chipY - 16, chipWidth, 28, 10, 10, 'FD');
		pdf.setTextColor(220, 229, 255);
		pdf.text(text, chipX + 9, chipY + 1);
		chipX += chipWidth + 10;
	});

	// framed grid card
	const cardTop = chipY + 26;
	const cardHeight = pageHeight - cardTop - 60;
	const cardWidth = pageWidth - horizontalMargin * 2;

	// subtle shadow
	pdf.setFillColor(6, 8, 20);
	pdf.roundedRect(horizontalMargin + 6, cardTop + 10, cardWidth, cardHeight, 20, 20, 'F');

	// card background
	pdf.setFillColor(20, 26, 58);
	pdf.setDrawColor(74, 92, 146);
	pdf.setLineWidth(0.8);
	pdf.roundedRect(horizontalMargin, cardTop, cardWidth, cardHeight, 20, 20, 'FD');

	const imageX = horizontalMargin + cardPadding;
	const imageY = cardTop + cardPadding;
	const imageWidth = cardWidth - cardPadding * 2;
	const imageHeight = cardHeight - cardPadding * 2;
	pdf.addImage(imageDataUrl, 'PNG', imageX, imageY, imageWidth, imageHeight, undefined, 'FAST');

	pdf.setFontSize(10);
	pdf.setTextColor(174, 186, 224);
	pdf.text('Generated via Compose-It · Grid export', horizontalMargin, pageHeight - 30);

	const blob = pdf.output('blob');
	downloadBlob(blob, `${slugify(title)}-grid.pdf`);
};

export const exportNotationPdf = (state: ComposerState) => {
	const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
	const margin = 48;
	const lineGap = 12;
	const measuresPerRow = 2;
	const meter = METERS[state.meter];
	const measureTicks = meter.beatsPerMeasure * TICKS_PER_BEAT;
	pdf.setFont('helvetica', 'bold');
	pdf.setFontSize(20);
	pdf.text(`${state.compositionName || 'Compose-It'} — Treble Staff`, margin, 54);
	pdf.setFontSize(11);
	pdf.text(`Meter ${state.meter} • Tempo ${state.tempo}`, margin, 72);

	const usableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
	const measureWidth = usableWidth / measuresPerRow;

	const drawStaff = (originX: number, originY: number) => {
		for (let line = 0; line < 5; line += 1) {
			const y = originY + line * lineGap;
			pdf.line(originX, y, originX + measureWidth - 15, y);
		}
	};

	const drawLedgerLines = (x: number, steps: number, originY: number) => {
		const bottomLineY = originY + 4 * lineGap;
		const stepHeight = lineGap / 2;
		const ledgerThreshold = 4; // lines index from bottom line
		if (steps > ledgerThreshold) {
			for (let current = ledgerThreshold + 1; current <= steps; current += 2) {
				const y = bottomLineY - current * stepHeight;
				pdf.line(x - 10, y, x + 10, y);
			}
		} else if (steps < -ledgerThreshold) {
			for (let current = -ledgerThreshold - 1; current >= steps; current -= 2) {
				const y = bottomLineY - current * stepHeight;
				pdf.line(x - 10, y, x + 10, y);
			}
		}
	};

	for (let measure = 0; measure < meter.measures; measure += 1) {
		const rowIndex = Math.floor(measure / measuresPerRow);
		const colIndex = measure % measuresPerRow;
		const originX = margin + colIndex * measureWidth;
		const originY = 110 + rowIndex * (lineGap * 6 + 70);

		drawStaff(originX, originY);
		pdf.text(`M${measure + 1}`, originX, originY - 6);

		const measureNotes = state.notes.filter((note) => {
			const measureStart = measure * measureTicks;
			return note.startTick >= measureStart && note.startTick < measureStart + measureTicks;
		});

		measureNotes.forEach((note) => {
			const measureStart = measure * measureTicks;
			const localTick = note.startTick - measureStart;
			const x = originX + (localTick / measureTicks) * (measureWidth - 30) + 15;
			const durationRatio = note.durationTicks / measureTicks;
			const width = Math.max(10, durationRatio * (measureWidth - 30));
			const steps = pitchToStaffSteps(note.pitch);
			const stepHeight = lineGap / 2;
			const y = originY + 4 * lineGap - steps * stepHeight;
			drawLedgerLines(x, steps, originY);
			const midi = pitchToMidi(note.pitch);
			const filled = midi >= 72; // heuristically fill for eighth+ notes up high
			pdf.ellipse(x, y, width * 0.12, 6, filled ? 'F' : 'S');
			const stemUp = steps < 3;
			const stemHeight = 34;
			const stemX = stemUp ? x + width * 0.12 : x - width * 0.12;
			const stemY1 = y;
			const stemY2 = stemUp ? y - stemHeight : y + stemHeight;
			pdf.line(stemX, stemY1, stemX, stemY2);
		});
	}

	const blob = pdf.output('blob');
	downloadBlob(blob, `${slugify(state.compositionName)}-notation.pdf`);
};
