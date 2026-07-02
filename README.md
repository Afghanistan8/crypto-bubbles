# CryptoBubbles — AI-Validated Crypto Market Intelligence on GenLayer

A live bubble visualization of the top 100 cryptocurrencies, backed by two GenLayer intelligent contracts that fetch real-time price data and generate AI-validated market sentiment analysis — fully on-chain, no oracles.

**Live demo:** [add your Vercel URL here]
**GitHub:** [add your repo URL here]

---

## What it does

CryptoBubbles shows all 100 top coins as physics-simulated bubbles sized by 24h price movement — biggest movers (up or down) get the biggest bubbles. Behind the scenes, two GenLayer intelligent contracts do the real work:

1. **CryptoPriceFeed** fetches live prices from CoinGecko directly from contract code, with multiple validators independently re-fetching and reaching AI-powered consensus before the data is written on-chain.
2. **MarketInsights** cross-contract-calls into CryptoPriceFeed, reads the stored prices, and has an LLM generate a structured sentiment report (bullish/bearish/neutral, confidence score, hot coin, summary) — validated by having each validator independently re-derive the sentiment from raw data and confirm it matches.

The frontend reads both — CoinGecko directly for the bubble visualization, and the GenLayer contract for the AI sentiment banner — via `gen_call`, a free read-only RPC method.

## Why GenLayer

Traditional price oracles need trusted middleware. GenLayer's intelligent contracts fetch web data and call LLMs directly from contract code, with the network's validators reaching consensus on non-deterministic outputs through the Equivalence Principle. This project uses two different equivalence patterns to solve two different consensus problems:

- **Comparative equivalence** (`prompt_comparative`) for the price feed — validators' fetched JSON just needs to represent "the same market state," not be byte-identical.
- **Partial field matching** (`run_nondet_unsafe` with a custom validator function) for sentiment analysis — the LLM's wording will always differ between validators, but its conclusion (bullish vs. bearish) must be independently re-derivable from the same raw data.

## Architecture

```
                    FRONTEND (Next.js)
    CryptoBubbles.tsx
    - CoinGecko API -> bubble visualization (live)
    - gen_call -> MarketInsights.get_analysis()
                   -> AI sentiment banner

         CryptoPriceFeed  <--- cross-contract call --- MarketInsights
         update_prices()                               generate_analysis()
           - gl.nondet.web.get                            - gl.get_contract_at()
           - prompt_comparative                            - gl.nondet.exec_prompt
         get_prices() [view]                              - run_nondet_unsafe
         get_top_movers() [view]                        get_analysis() [view]
```

## Deployed contracts (GenLayer Studio Network)

| Contract | Address | Purpose |
|---|---|---|
| CryptoPriceFeed | `0xeE3CdA218ab3a9adc759E6800B4f972A1fefC5f4` | Fetches & stores top 100 coin prices |
| MarketInsights | `0x5D3eF2962cDa27099392825F2B0323Baefa7B916` | Cross-contract reads + AI sentiment analysis |

## GenLayer primitives used

1. `gl.nondet.web.get()` — live web data access from contract code
2. `gl.eq_principle.prompt_comparative()` — AI-validated consensus on price data
3. `gl.get_contract_at()` — cross-contract calls
4. `gl.nondet.exec_prompt()` — direct LLM invocation from contract code
5. `gl.vm.run_nondet_unsafe()` with a custom validator function — partial-field-match consensus for AI-generated analysis
6. GenLayer state storage, CLI deployment, JSON-RPC `gen_call` for frontend reads

## Contracts

### `contracts/crypto_price_feed.py`

Version header `# v0.1.0` and Depends tag `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

- `update_prices()` — fetches CoinGecko's top-100 markets endpoint; validators reach comparative consensus (5% price tolerance, matching coin IDs) before storage
- `get_prices()` — free view call, returns full JSON array
- `get_top_movers()` — returns top 10 gainers/losers

### `contracts/market_insights.py`

- Constructor takes the CryptoPriceFeed address and stores it
- `generate_analysis()` — leader fetches CoinGecko independently, prompts an LLM for structured sentiment JSON; each validator re-fetches, derives its own gainer/loser-ratio-based sentiment, and confirms it matches the leader's conclusion (not exact wording)
- `get_analysis()` — free view call, returns the latest sentiment JSON

## Running locally

```bash
git clone <your-repo-url>
cd crypto-bubbles
npm install
npm run dev
```

Open http://localhost:3000.

## Redeploying the contracts

```bash
cd contracts
genlayer network set studionet
genlayer deploy --contract crypto_price_feed.py --args '[]'
genlayer write <PRICE_FEED_ADDRESS> update_prices
genlayer deploy --contract market_insights.py --args <PRICE_FEED_ADDRESS>
genlayer write <MARKET_INSIGHTS_ADDRESS> generate_analysis
```

Update the addresses in `components/CryptoBubbles.tsx` (`MARKET_INSIGHTS_ADDRESS`) after redeploying.

## Tech stack

- Contracts: Python (GenLayer Intelligent Contracts)
- Frontend: Next.js, React, SVG physics simulation
- Network: GenLayer Studio Network
- Data: CoinGecko API (direct + on-chain via GenLayer)
- Deployment: Vercel

## Author

Built by Alpha as part of the GenLayer Builder Program.
GitHub: [Afghanistan8](https://github.com/Afghanistan8)
