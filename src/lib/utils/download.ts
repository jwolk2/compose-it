export const downloadBlob = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const downloadJson = (data: unknown, filename: string) => {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	downloadBlob(blob, filename);
};
