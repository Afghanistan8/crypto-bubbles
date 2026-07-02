# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class MarketInsights(gl.Contract):
    price_feed_address: str
    latest_analysis: str
    analysis_count: str

    def __init__(self, price_feed):
        self.price_feed_address = str(price_feed)
        self.latest_analysis = "{}"
        self.analysis_count = "0"

    @gl.public.write
    def generate_analysis(self) -> typing.Any:

        api_url = (
            "https://api.coingecko.com/api/v3/coins/markets"
            "?vs_currency=usd&order=market_cap_desc&per_page=30&page=1"
            "&sparkline=false&price_change_percentage=24h"
        )

        def leader_fn():
            response = gl.nondet.web.get(api_url)
            prices_data = json.loads(response.body.decode("utf-8"))

            gainers = [c for c in prices_data if c.get("price_change_percentage_24h", 0) > 0]
            losers = [c for c in prices_data if c.get("price_change_percentage_24h", 0) < 0]

            biggest_gainer = max(prices_data, key=lambda c: c.get("price_change_percentage_24h", 0))
            biggest_loser = min(prices_data, key=lambda c: c.get("price_change_percentage_24h", 0))

            top_10 = prices_data[:10]
            summary_lines = []
            for coin in top_10:
                summary_lines.append(
                    f"{coin.get('symbol','?')}: ${coin.get('current_price',0)} "
                    f"({coin.get('price_change_percentage_24h',0):+.2f}%)"
                )

            market_data = "\n".join(summary_lines)
            gainer_count = len(gainers)
            loser_count = len(losers)

            prompt = (
                f"Crypto market data (top 30 coins):\n"
                f"Gainers: {gainer_count} | Losers: {loser_count}\n"
                f"Biggest gainer: {biggest_gainer.get('symbol','?')} "
                f"at {biggest_gainer.get('price_change_percentage_24h',0):+.2f}%\n"
                f"Biggest loser: {biggest_loser.get('symbol','?')} "
                f"at {biggest_loser.get('price_change_percentage_24h',0):+.2f}%\n"
                f"Top 10:\n{market_data}\n\n"
                f"Based on this data, return ONLY a JSON object with exactly these fields:\n"
                f"{{\"sentiment\": \"bullish\" or \"bearish\" or \"neutral\", "
                f"\"score\": integer -100 to 100, "
                f"\"hot_coin\": \"single coin symbol with strongest momentum\", "
                f"\"summary\": \"one sentence overview\"}}\n"
                f"No markdown. No explanation. Only JSON."
            )

            result = gl.nondet.exec_prompt(prompt)
            parsed = json.loads(result.strip())
            return json.dumps(parsed, sort_keys=True)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False

            try:
                leader_data = json.loads(leader_result.calldata)
            except Exception:
                return False

            # Validate required fields exist
            required = ["sentiment", "score", "hot_coin", "summary"]
            for field in required:
                if field not in leader_data:
                    return False

            # Validate sentiment is a valid value
            if leader_data["sentiment"] not in ("bullish", "bearish", "neutral"):
                return False

            # Validate score is in range
            score = leader_data.get("score", None)
            if not isinstance(score, (int, float)):
                return False
            if not (-100 <= score <= 100):
                return False

            # Re-fetch independently to verify sentiment direction
            try:
                response = gl.nondet.web.get(api_url)
                prices_data = json.loads(response.body.decode("utf-8"))
                gainers = len([c for c in prices_data if c.get("price_change_percentage_24h", 0) > 0])
                losers = len([c for c in prices_data if c.get("price_change_percentage_24h", 0) < 0])

                # Derive expected sentiment from raw data
                if gainers > losers * 1.5:
                    expected = "bullish"
                elif losers > gainers * 1.5:
                    expected = "bearish"
                else:
                    expected = "neutral"

                # Sentiment must match the market direction OR be neutral
                # Allow neutral as a middle ground in any case
                if leader_data["sentiment"] == "neutral":
                    return True
                return leader_data["sentiment"] == expected

            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        self.latest_analysis = result
        count = int(self.analysis_count)
        self.analysis_count = str(count + 1)

    @gl.public.view
    def get_analysis(self) -> str:
        return self.latest_analysis

    @gl.public.view
    def get_analysis_count(self) -> str:
        return self.analysis_count

    @gl.public.view
    def get_price_feed_address(self) -> str:
        return self.price_feed_address
