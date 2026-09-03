# syncvotes

A placeholder app for seeing how Daml and TypeScript fit together. Contract types are generated from the Daml source; keys, signing and ledger credentials belong to a Canton wallet that the app connects to over CIP-103. The app itself holds no secrets and has no ledger backend.

## Setup

`daml.js/` is generated and gitignored, so a fresh clone has to produce it before pnpm can resolve `@daml.js/model`. Codegen first, install second — `pnpm i` on its own will fail until it exists:

```sh
pnpm daml:codegen   # builds the DAR and writes daml.js/
pnpm i
```

## Running it

One terminal:

```sh
pnpm start          # all three services, output prefixed per service; Ctrl-C stops all of them
```

It runs the three services below, which you can also start in separate terminals:

```sh
pnpm ledger:start   # builds the DAR, then the Canton sandbox — gRPC on 6865, JSON Ledger API on 6864
pnpm wallet:start   # wallet gateway on http://localhost:3030, configured against that sandbox
pnpm dev            # the app on http://localhost:5173
```

The wallet logs in as `participant_admin`, which a fresh sandbox already has, so there is nothing to provision first. `canton.conf` puts the sandbox's state in H2 files under `.canton/`, so parties and contracts survive a restart — delete that directory for a clean ledger.

Press **Connect wallet**. A picker opens in a popup window; pick the gateway on `localhost:3030`, or paste any other CIP-103 wallet's API URL into the **custom wallet** field.

First time through, open <http://localhost:3030> and create two parties (**Parties → New**), each with the `wallet-kernel` signing provider — that is the wallet generating and keeping the key. They show up in the app as the parties you can act as. Issuing and giving then pop up an approval window where the wallet asks you to sign.

If your wallet talks to a different participant, point `wallet-gateway.config.json` at it. Off the sandbox there is no `participant_admin` to borrow, so `auth`/`adminAuth` need real users that exist on that participant — the login user needs no admin rights, `adminAuth` needs `ParticipantAdmin`.

## How the two languages meet

`daml/src/Main.daml` is the source of truth. `pnpm daml:codegen` compiles it to a DAR and runs `dpm codegen-js`, which writes TypeScript packages into `daml.js/` — wired in as a pnpm workspace so `@daml.js/model` resolves like any dependency. Re-run it after every change to the Daml side, followed by `pnpm i` — codegen wipes `daml.js/` so a stale package can never linger, and that takes the generated packages' own links with it until pnpm relinks them. `pnpm build` does both for you.

Codegen names its output `@daml.js/<name>-<version>` from `daml/daml.yaml` — neither `-s` nor the `codegen:` stanza can drop the version from that name. So package.json aliases it once, under `@daml.js/model`, and everything else (imports, Vite, the DAR paths) uses the alias or a glob. Bumping the version means editing `daml/daml.yaml` and that one alias line.

`src/lib/ledger.ts` is the only place the two meet, and the generated code carries the weight:

- `Asset.templateId` — `#daml:Main:Asset`, the package-name-scoped id the ledger expects
- `Asset.encode` / `Asset.Give.argumentEncode` — build command payloads from typed values
- `Asset.decoder` — validates what comes back. This matters more than usual here, because the SDK types `ledgerApi()` responses as `any`; the decoder is what turns that back into a checked `Asset`

To see the loop close, add a field to the `Asset` template, run `pnpm daml:codegen && pnpm i`, and `pnpm check` will point at every TypeScript line that needs updating.

## How the app talks to the ledger

Everything goes through the wallet, via `@canton-network/dapp-sdk`:

| Operation      | Call                                                               |
| -------------- | ------------------------------------------------------------------ |
| Connect        | `connect()` — opens the wallet picker, establishes a session       |
| Parties        | `listAccounts()` — the parties the wallet controls                 |
| Read contracts | `ledgerApi()` — proxies an authenticated JSON Ledger API request   |
| Issue / give   | `prepareExecuteAndWait()` — the wallet prepares, signs and submits |

The app never sees a private key and never signs anything. That is why there is no server-side ledger client and no `.remote.ts` files any more: with the wallet holding the credentials, a backend would have nothing to add. `src/routes/+page.ts` sets `ssr = false` for the same reason.

## Layout

| Path                 | What it is                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `daml/src/Main.daml` | The `Asset` template and its `Give` choice                           |
| `daml.js/`           | Generated bindings — never edit, regenerate with `pnpm daml:codegen` |
| `src/lib/ledger.ts`  | The wallet-mediated ledger layer                                     |
| `src/lib/parties.ts` | Shortens `alice::1220ab…` for display                                |

## Notes

- **The gateway version is pinned to 1.8.1 on purpose.** 1.9.0 sends `HASHING_SCHEME_VERSION_V3`, which Canton 3.4.11 rejects — it only accepts `V2`. Move the pin up when you move the SDK up.
- Party state lives in two places that have to be wiped together: the ledger keeps the parties in `.canton/`, the wallet gateway keeps their signing keys in `.wallet/*.sqlite`. Delete only `.wallet` and the wallet rediscovers the parties but reports "no signing provider matched", because the keys are gone. Delete only `.canton` and the wallet lists parties the ledger has never heard of. Either way, create fresh parties.
- The sequencer's block store stays in memory: the reference sequencer only accepts `memory` or `postgres` there, not `h2`. Its identity and topology are persisted in `.canton/sequencer.mv.db`, so the synchronizer id is stable across restarts and the participant reconnects to the same synchronizer — verified by restarting with a contract in the ACS.
- `dpm codegen-js` emits CommonJS. Vite does not pre-bundle workspace-linked packages by default, so `optimizeDeps.include` in `vite.config.ts` is what stops the browser receiving raw CJS.
- `@walletconnect/sign-client` is an optional peer of the dApp SDK; it is installed so the WalletConnect adapter stays available alongside the gateway and extension ones.
- `ledgerApi()` takes a lowercase `requestMethod` (`'get'`, `'post'`), despite the docs example showing `'GET'`.

## Building

```sh
pnpm build
node build
```
