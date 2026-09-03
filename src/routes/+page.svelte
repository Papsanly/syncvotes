<script lang="ts">
	import * as wallet from '@canton-network/dapp-sdk';
	import type { ContractId } from '@daml/types';
	import type { Main } from '@daml.js/model';
	import * as ledger from '$lib/ledger';
	import { partyLabel } from '$lib/parties';

	let connected = $state(false);
	let accounts = $state<{ partyId: string; hint: string }[]>([]);
	let selected = $state<string | null>(null);
	let assets = $state<ledger.AssetContract[]>([]);
	let newAssetName = $state('');
	let busy = $state(false);
	let problem = $state<string | null>(null);

	const actor = $derived(selected ?? accounts[0]?.partyId ?? null);

	$effect(() => {
		// Restore a previous wallet session without popping the picker open on every load.
		wallet.init().then(refreshSession).catch(report);
	});

	$effect(() => {
		if (actor) void refreshAssets(actor);
	});

	function report(error: unknown) {
		problem = error instanceof Error ? error.message : String(error);
	}

	async function run(action: () => Promise<void>) {
		busy = true;
		problem = null;
		try {
			await action();
		} catch (error) {
			report(error);
		} finally {
			busy = false;
		}
	}

	async function refreshSession() {
		const status = await wallet.isConnected();
		connected = status.isConnected;
		accounts = connected ? await wallet.listAccounts() : [];
	}

	async function refreshAssets(party: string) {
		try {
			assets = await ledger.listAssets(party);
		} catch (error) {
			report(error);
		}
	}

	const connect = () =>
		run(async () => {
			await wallet.connect();
			await refreshSession();
		});

	const disconnect = () =>
		run(async () => {
			await wallet.disconnect();
			connected = false;
			accounts = [];
			assets = [];
		});

	const issue = (event: SubmitEvent) => {
		event.preventDefault();
		if (!actor || !newAssetName.trim()) return;

		return run(async () => {
			await ledger.issueAsset(actor, newAssetName.trim());
			newAssetName = '';
			await refreshAssets(actor);
		});
	};

	const give = (contractId: ContractId<Main.Asset>, newOwner: string) =>
		run(async () => {
			if (!actor) return;
			await ledger.giveAsset(actor, contractId, newOwner);
			await refreshAssets(actor);
		});
</script>

<main class="mx-auto max-w-2xl space-y-8 p-8">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold">SyncVotes — Daml ↔ TypeScript</h1>
		<p class="text-sm text-gray-600">
			Contract types come from <code>Main.daml</code> via <code>dpm codegen-js</code>; keys and
			signing belong to your Canton wallet.
		</p>
	</header>

	{#if problem}
		<p class="rounded bg-red-50 p-4 text-sm text-red-700">{problem}</p>
	{/if}

	{#if !connected}
		<section class="space-y-3 rounded border border-dashed p-6 text-center">
			<p class="text-sm text-gray-600">
				This app holds no keys. Connect a CIP-103 wallet — the picker also accepts a custom gateway
				URL.
			</p>
			<button
				class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
				disabled={busy}
				onclick={connect}
			>
				Connect wallet
			</button>
		</section>
	{:else}
		<section class="space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold">Acting as</h2>
				<button class="text-xs text-gray-500 underline" onclick={disconnect}>Disconnect</button>
			</div>
			{#if accounts.length === 0}
				<p class="text-sm text-gray-500">The wallet exposed no accounts.</p>
			{:else}
				<div class="flex flex-wrap gap-2">
					{#each accounts as account (account.partyId)}
						<button
							type="button"
							class="rounded border px-3 py-1 text-sm {actor === account.partyId
								? 'border-blue-600 bg-blue-600 text-white'
								: 'border-gray-300'}"
							onclick={() => (selected = account.partyId)}
						>
							{account.hint || partyLabel(account.partyId)}
						</button>
					{/each}
				</div>
			{/if}
		</section>

		<form class="flex gap-2" onsubmit={issue}>
			<input
				class="flex-1 rounded border-gray-300"
				placeholder="Asset name, e.g. Guitar"
				bind:value={newAssetName}
			/>
			<button
				class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
				disabled={busy || !newAssetName.trim() || !actor}
			>
				Issue
			</button>
		</form>

		<section class="space-y-2">
			<h2 class="font-semibold">Visible contracts</h2>
			{#if assets.length === 0}
				<p class="text-sm text-gray-500">Nothing visible to this party yet.</p>
			{:else}
				<ul class="divide-y rounded border">
					{#each assets as asset (asset.contractId)}
						{@const others = accounts.filter((a) => a.partyId !== asset.payload.owner)}
						<li class="flex items-center justify-between gap-4 p-3">
							<div>
								<p class="font-medium">{asset.payload.name}</p>
								<p class="text-xs text-gray-500">
									owner: {partyLabel(asset.payload.owner)} · issuer: {partyLabel(
										asset.payload.issuer
									)}
								</p>
							</div>
							<div class="flex gap-1">
								{#each others as other (other.partyId)}
									<button
										type="button"
										class="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
										disabled={busy || asset.payload.owner !== actor}
										title={asset.payload.owner !== actor
											? 'Only the owner can exercise Give'
											: `Give to ${other.hint}`}
										onclick={() => give(asset.contractId, other.partyId)}
									>
										Give to {other.hint || partyLabel(other.partyId)}
									</button>
								{/each}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>
