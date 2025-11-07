<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { FORCE_CLEAR_FLAG } from '$lib/state/composerStore';

	onMount(() => {
		if (!browser) return;
		const handler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key?.toLowerCase() === 'r') {
				sessionStorage.setItem(FORCE_CLEAR_FLAG, '1');
			}
		};
		window.addEventListener('keydown', handler, { capture: true });
		return () => window.removeEventListener('keydown', handler, { capture: true });
	});
</script>

<div class="main-shell">
	<slot />
</div>
