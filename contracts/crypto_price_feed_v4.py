# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class CryptoPriceFeed(gl.Contract):
    prices_json: str
    top_movers_json: str

    def __init__(self):
        self.prices_json = "[]"
        self.top_movers_json = "{}"

    @gl.public.write
    def update_prices(self) -> typing.Any:
        api_url = (
            "https://api.coingecko.com/api/v3/coins/markets"
            "?vs_currency=usd"
            "&order=market_cap_desc"
            "&per_page=100"
            "&page=1"
            "&sparkline=false"
            "&price_change_percentage=24h"
        )

        def fetch_all():
            response = gl.nondet.web.get(api_url)
            data = json.loads(response.body.decode("utf-8"))

            coins = []
            for coin in data:
                coins.append({
                    "id": coin.get("id", ""),
                    "symbol": coin.get("symbol", "").upper(),
                    "name": coin.get("name", ""),
                    "image": coin.get("image", ""),
                    "current_price": coin.get("current_price", 0),
                    "market_cap": coin.get("market_cap", 0),
                    "market_cap_rank": coin.get("market_cap_rank", 0),
                    "price_change_percentage_24h": coin.get(
                        "price_change_percentage_24h", 0
                    ),
                    "total_volume": coin.get("total_volume", 0),
                })

            return json.dumps(coins, sort_keys=True)

        result = gl.eq_principle.prompt_comparative(
            fetch_all,
            principle="The crypto market data must contain approximately 100 coins. "
            "The top coins by market cap (BTC, ETH, USDT, BNB, SOL) must be present. "
            "Prices for each coin must be within 5% of each other between fetches. "
            "All coin IDs and symbols must match exactly."
        )

        parsed = json.loads(result)
        self.prices_json = result

        gainers = [c for c in parsed if c.get("price_change_percentage_24h", 0) > 0]
        gainers.sort(key=lambda c: c.get("price_change_percentage_24h", 0), reverse=True)

        losers = [c for c in parsed if c.get("price_change_percentage_24h", 0) < 0]
        losers.sort(key=lambda c: c.get("price_change_percentage_24h", 0))

        self.top_movers_json = json.dumps({
            "gainers": gainers[:10],
            "losers": losers[:10]
        }, sort_keys=True)

    @gl.public.view
    def get_prices(self) -> str:
        return self.prices_json

    @gl.public.view
    def get_top_movers(self) -> str:
        return self.top_movers_json
