import * as wallet from '@canton-network/dapp-sdk';
import { Main } from '@daml.js/model';
import type { ContractId, Party } from '@daml/types';

const { Asset } = Main;
type Asset = Main.Asset;

/** A contract as it comes back from the ACS query, with `payload` run through the codegen'd decoder. */
export type AssetContract = {
	contractId: ContractId<Asset>;
	payload: Asset;
};

/**
 * Every ledger read goes through the wallet, which attaches the user's credentials. The SDK types
 * the response as `any`, so anything we care about is validated below by the Daml-generated
 * decoders rather than trusted.
 */
async function read<T>(resource: string, body?: Record<string, unknown>): Promise<T> {
	// Lowercase, despite the docs example showing `'GET'` — the type is `'get' | 'post' | …`.
	const result = await wallet.ledgerApi(
		body === undefined
			? { requestMethod: 'get', resource }
			: { requestMethod: 'post', resource, body }
	);

	return result as T;
}

export async function listAssets(party: Party): Promise<AssetContract[]> {
	const { offset } = await read<{ offset: number }>('/v2/state/ledger-end');

	const entries = await read<
		{
			contractEntry?: {
				JsActiveContract?: {
					createdEvent: { contractId: string; createArgument: unknown };
				};
			};
		}[]
	>('/v2/state/active-contracts', {
		filter: {
			filtersByParty: {
				[party]: {
					cumulative: [
						{
							identifierFilter: {
								TemplateFilter: {
									value: { templateId: Asset.templateId, includeCreatedEventBlob: false }
								}
							}
						}
					]
				}
			}
		},
		verbose: false,
		activeAtOffset: offset
	});

	return entries.flatMap((entry) => {
		const created = entry.contractEntry?.JsActiveContract?.createdEvent;
		if (!created) return [];

		return [
			{
				contractId: created.contractId as ContractId<Asset>,
				// Generated from Main.daml — a shape change on the Daml side surfaces as a decode error.
				payload: Asset.decoder.runWithException(created.createArgument)
			}
		];
	});
}

/**
 * Hands the command to the wallet, which prepares it, asks the user to approve, signs with the
 * party's key and submits. This app never sees a private key.
 */
export async function issueAsset(issuer: Party, name: string): Promise<void> {
	const payload: Asset = { issuer, owner: issuer, name };

	await wallet.prepareExecuteAndWait({
		actAs: [issuer],
		commands: [
			{ CreateCommand: { templateId: Asset.templateId, createArguments: Asset.encode(payload) } }
		]
	});
}

export async function giveAsset(
	owner: Party,
	contractId: ContractId<Asset>,
	newOwner: Party
): Promise<void> {
	await wallet.prepareExecuteAndWait({
		actAs: [owner],
		commands: [
			{
				ExerciseCommand: {
					templateId: Asset.templateId,
					contractId,
					choice: 'Give',
					choiceArgument: Asset.Give.argumentEncode({ newOwner })
				}
			}
		]
	});
}
