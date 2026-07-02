"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const COINGECKO_API =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h";

const MARKET_INSIGHTS_ADDRESS = "0x5D3eF2962cDa27099392825F2B0323Baefa7B916";

interface SentimentData {
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  hot_coin: string;
  summary: string;
}

async function fetchMarketSentiment(): Promise<SentimentData | null> {
  try {
    const { createClient } = await import("genlayer-js");
    const { studionet } = await import("genlayer-js/chains");

    const client = createClient({ chain: studionet });

    const raw = await client.readContract({
      address: MARKET_INSIGHTS_ADDRESS as `0x${string}`,
      functionName: "get_analysis",
      args: [],
    });

    if (!raw || raw === "{}") return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed.sentiment) return null;
    return parsed as SentimentData;
  } catch {
    return null;
  }
}

function formatPrice(p: number) {
  if (p >= 1000) return `$${(p / 1000).toFixed(1)}K`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function formatMcap(m: number) {
  if (m >= 1e12) return `$${(m / 1e12).toFixed(1)}T`;
  if (m >= 1e9) return `$${(m / 1e9).toFixed(1)}B`;
  if (m >= 1e6) return `$${(m / 1e6).toFixed(0)}M`;
  return `$${m.toLocaleString()}`;
}

function getBubbleColor(change: number) {
  if (change > 8) return { bg: "#00E676", text: "#003d1f", glow: "rgba(0,230,118,0.4)" };
  if (change > 4) return { bg: "#66BB6A", text: "#0a2e0a", glow: "rgba(102,187,106,0.3)" };
  if (change > 0) return { bg: "#2E7D32", text: "#c8f7c8", glow: "rgba(46,125,50,0.2)" };
  if (change > -4) return { bg: "#C62828", text: "#ffc8c8", glow: "rgba(198,40,40,0.2)" };
  if (change > -8) return { bg: "#E53935", text: "#1a0505", glow: "rgba(229,57,53,0.3)" };
  return { bg: "#FF1744", text: "#2a0008", glow: "rgba(255,23,68,0.4)" };
}

function getBubbleRadius(change: number, rank: number) {
  const absChange = Math.abs(change || 0);
  const rankFactor = Math.max(0.4, 1 - rank * 0.005);
  const base = 18 + absChange * 3.5;
  return Math.min(Math.max(base * rankFactor, 14), 70);
}

interface Coin {
  id: string; symbol: string; name: string; image: string;
  current_price: number; market_cap: number; market_cap_rank: number;
  price_change_percentage_24h: number; total_volume: number;
}

interface BubblePos { x: number; y: number; r: number; }

function computeLayout(radii: number[], width: number, height: number, topOffset: number = 0): BubblePos[] {
  if (!radii.length || !width || !height) return [];
  const usableHeight = height - topOffset;
  const cx = width / 2, cy = topOffset + usableHeight / 2;
  const pos = radii.map((r, i) => {
    const angle = (i / radii.length) * Math.PI * 2;
    const spread = Math.min(width, usableHeight) * 0.35;
    return { x: cx + Math.cos(angle) * spread * (0.3 + Math.random() * 0.7), y: cy + Math.sin(angle) * spread * (0.3 + Math.random() * 0.7), r };
  });
  const vel = radii.map(() => ({ vx: 0, vy: 0 }));
  for (let tick = 0; tick < 250; tick++) {
    for (let i = 0; i < pos.length; i++) {
      vel[i].vx += (cx - pos[i].x) * 0.0003;
      vel[i].vy += (cy - pos[i].y) * 0.0003;
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = pos[i].r + pos[j].r + 3;
        if (dist < minDist) {
          const force = ((minDist - dist) / dist) * 0.15;
          vel[i].vx -= dx * force; vel[i].vy -= dy * force;
          vel[j].vx += dx * force; vel[j].vy += dy * force;
        }
      }
      vel[i].vx *= 0.7; vel[i].vy *= 0.7;
      pos[i].x += vel[i].vx; pos[i].y += vel[i].vy;
      const pad = pos[i].r + 4;
      if (pos[i].x < pad) { pos[i].x = pad; vel[i].vx = 0; }
      if (pos[i].x > width - pad) { pos[i].x = width - pad; vel[i].vx = 0; }
      if (pos[i].y < topOffset + pad) { pos[i].y = topOffset + pad; vel[i].vy = 0; }
      if (pos[i].y > height - pad) { pos[i].y = height - pad; vel[i].vy = 0; }
    }
  }
  return pos;
}

function DetailPanel({ coin, onClose }: { coin: Coin | null; onClose: () => void }) {
  if (!coin) return null;
  const change = coin.price_change_percentage_24h || 0;
  const isGainer = change >= 0;
  const colors = getBubbleColor(change);
  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, background: "rgba(10,10,18,0.95)", backdropFilter: "blur(20px)", borderRadius: 16, border: `1px solid ${colors.bg}44`, padding: "20px 24px", display: "flex", alignItems: "center", gap: 20, zIndex: 20, boxShadow: `0 0 40px ${colors.glow}` }}>
      <img src={coin.image} alt={coin.name} style={{ width: 48, height: 48, borderRadius: 12 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#f0f0f0", fontFamily: "'Space Grotesk', sans-serif" }}>{coin.name}</span>
          <span style={{ fontSize: 13, color: "#888", fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{coin.symbol}</span>
          <span style={{ fontSize: 11, color: "#555", fontFamily: "'SF Mono', monospace" }}>#{coin.market_cap_rank}</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>PRICE</div><div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f0", fontFamily: "'SF Mono', monospace" }}>{formatPrice(coin.current_price)}</div></div>
          <div><div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>24H</div><div style={{ fontSize: 18, fontWeight: 700, color: colors.bg, fontFamily: "'SF Mono', monospace" }}>{isGainer ? "+" : ""}{change.toFixed(2)}%</div></div>
          <div><div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>MCAP</div><div style={{ fontSize: 14, fontWeight: 600, color: "#aaa", fontFamily: "'SF Mono', monospace" }}>{formatMcap(coin.market_cap)}</div></div>
          <div><div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>VOLUME</div><div style={{ fontSize: 14, fontWeight: 600, color: "#aaa", fontFamily: "'SF Mono', monospace" }}>{formatMcap(coin.total_volume)}</div></div>
        </div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
    </div>
  );
}

function SentimentBanner({ data }: { data: SentimentData | null }) {
  if (!data) return null;

  const colors =
    data.sentiment === "bullish"
      ? { bg: "#00E67615", border: "#00E67644", text: "#00E676" }
      : data.sentiment === "bearish"
      ? { bg: "#FF174415", border: "#FF174444", text: "#FF1744" }
      : { bg: "#7C4DFF15", border: "#7C4DFF44", text: "#B388FF" };

  const arrow = data.sentiment === "bullish" ? "▲" : data.sentiment === "bearish" ? "▼" : "●";

  return (
    <div
      style={{
        position: "absolute",
        top: 100,
        left: 20,
        right: 20,
        zIndex: 10,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: colors.text, fontSize: 14, fontWeight: 800 }}>{arrow}</span>
        <span style={{ color: colors.text, fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {data.sentiment}
        </span>
        <span style={{ color: colors.text, fontSize: 11, fontFamily: "'SF Mono', monospace", opacity: 0.8 }}>
          {data.score > 0 ? "+" : ""}
          {data.score}
        </span>
      </div>
      <div style={{ width: 1, height: 16, background: `${colors.text}33` }} />
      <span style={{ fontSize: 12, color: "#aaa", fontFamily: "'Space Grotesk', sans-serif", flex: 1, minWidth: 200 }}>
        {data.summary}
      </span>
      <div style={{ fontSize: 10, color: "#555", fontFamily: "'SF Mono', monospace", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7C4DFF", display: "inline-block" }} />
        AI · GenLayer on-chain
      </div>
    </div>
  );
}

export default function CryptoBubbles() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Coin | null>(null);
  const [showTop20, setShowTop20] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDims({ w: rect.width, h: rect.height });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(COINGECKO_API);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setCoins(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch { setCoins(generateDemoData()); setLastUpdated("demo data"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetchMarketSentiment().then(setSentiment);
  }, []);

  const filtered = useMemo(() => coins.filter((c) => {
    const ch = c.price_change_percentage_24h || 0;
    if (filter === "gainers") return ch > 0;
    if (filter === "losers") return ch < 0;
    if (filter === "top20") return (c.market_cap_rank || 999) <= 20;
    return true;
  }), [coins, filter]);

  const radii = useMemo(() => filtered.map((c, i) => getBubbleRadius(c.price_change_percentage_24h, i)), [filtered]);

  const topMovers = useMemo(() => [...coins]
    .sort((a, b) => Math.abs(b.price_change_percentage_24h || 0) - Math.abs(a.price_change_percentage_24h || 0))
    .slice(0, 5), [coins]);

  const bubbleTopOffset = useMemo(() => {
    let offset = 68; // header
    if (sentiment) offset += 56; // sentiment banner
    if (topMovers.length > 0) offset += 44; // top movers strip
    return offset;
  }, [sentiment, topMovers.length]);

  const positions = useMemo(() => computeLayout(radii, dims.w, dims.h, bubbleTopOffset), [radii, dims.w, dims.h, bubbleTopOffset]);

  const top20Coins = useMemo(() => [...coins]
    .filter(c => c.market_cap_rank && c.market_cap_rank <= 20)
    .sort((a, b) => (a.market_cap_rank || 999) - (b.market_cap_rank || 999)), [coins]);

  const filters = [
    { key: "all", label: "All Coins" },
    { key: "gainers", label: "Gainers" },
    { key: "losers", label: "Losers" },
    { key: "top20", label: "Top 20" },
  ];

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100vh", background: "radial-gradient(ellipse at 50% 30%, #0d0d1a 0%, #060610 60%, #020208 100%)", position: "relative", overflow: "hidden", fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg, rgba(6,6,14,0.95) 0%, transparent 100%)", zIndex: 10, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f0f0f0", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.5px" }}>
            <span style={{ color: "#7C4DFF" }}>◉</span> CryptoBubbles
          </div>
          <div style={{ fontSize: 10, color: "#555", fontFamily: "'SF Mono', monospace", border: "1px solid #222", borderRadius: 6, padding: "3px 8px" }}>GENLAYER</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {filters.map((f) => (
            <button key={f.key} onClick={() => { if (f.key === "top20") { setShowTop20(!showTop20); } else { setShowTop20(false); setFilter(f.key); } }} style={{ background: (f.key === "top20" ? showTop20 : filter === f.key && !showTop20) ? "#7C4DFF22" : "transparent", border: `1px solid ${(f.key === "top20" ? showTop20 : filter === f.key && !showTop20) ? "#7C4DFF" : "#222"}`, color: (f.key === "top20" ? showTop20 : filter === f.key && !showTop20) ? "#B388FF" : "#666", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.2s" }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#444", fontFamily: "'SF Mono', monospace", display: "flex", gap: 16 }}>
          <span>{filtered.length} coins</span>
          {lastUpdated && <span>updated {lastUpdated}</span>}
        </div>
      </div>

      <SentimentBanner data={sentiment} />

      {topMovers.length > 0 && (
        <div style={{ position: "absolute", top: sentiment ? 144 : 68, left: 20, right: 20, display: "flex", gap: 8, zIndex: 10, overflow: "auto", paddingBottom: 4, transition: "top 0.3s" }}>
          <span style={{ fontSize: 10, color: "#555", fontWeight: 700, fontFamily: "'SF Mono', monospace", whiteSpace: "nowrap", alignSelf: "center" }}>TOP MOVERS</span>
          {topMovers.map((c) => {
            const ch = c.price_change_percentage_24h || 0;
            const col = getBubbleColor(ch);
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, background: `${col.bg}15`, border: `1px solid ${col.bg}33`, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: col.bg, fontFamily: "'SF Mono', monospace" }}>{c.symbol}</span>
                <span style={{ fontSize: 11, color: col.bg, fontFamily: "'SF Mono', monospace" }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 16, fontFamily: "'SF Mono', monospace" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #222", borderTop: "3px solid #7C4DFF", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
            fetching price feeds...
          </div>
        </div>
      ) : (
        <svg width={dims.w} height={dims.h} style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <radialGradient id="bubbleSheen" cx="35%" cy="35%">
              <stop offset="0%" stopColor="white" stopOpacity="0.6" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>
          {positions.map((pos, i) => {
            if (!filtered[i]) return null;
            const coin = filtered[i];
            const change = coin.price_change_percentage_24h || 0;
            const colors = getBubbleColor(change);
            const isGainer = change >= 0;
            const r = pos.r;
            return (
              <g key={coin.id} transform={`translate(${pos.x}, ${pos.y})`} style={{ cursor: "pointer" }} onClick={() => setSelected(coin)}>
                <circle r={r + 4} fill="none" stroke={colors.glow} strokeWidth={selected?.id === coin.id ? 3 : 1.5} opacity={selected?.id === coin.id ? 1 : 0.6} />
                <circle r={r} fill={colors.bg} opacity={0.92} />
                <circle r={r * 0.7} fill="url(#bubbleSheen)" opacity={0.15} />
                <text textAnchor="middle" dy={r > 30 ? "-0.4em" : "0.1em"} fill={colors.text} fontSize={Math.max(8, Math.min(r * 0.42, 16))} fontWeight="800" fontFamily="'SF Mono', 'Fira Code', monospace" style={{ pointerEvents: "none" }}>
                  {coin.symbol}
                </text>
                {r > 22 && (
                  <text textAnchor="middle" dy={r > 30 ? "1em" : "1.4em"} fill={colors.text} fontSize={Math.max(7, Math.min(r * 0.3, 12))} fontWeight="600" fontFamily="'SF Mono', monospace" opacity={0.9} style={{ pointerEvents: "none" }}>
                    {isGainer ? "+" : ""}{change.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      <DetailPanel coin={selected} onClose={() => setSelected(null)} />

      {/* Top 20 Panel */}
      {showTop20 && top20Coins.length > 0 && (
        <div style={{ position: "absolute", top: 0, right: 0, width: 380, height: "100vh", background: "rgba(8,8,18,0.97)", backdropFilter: "blur(20px)", borderLeft: "1px solid #1a1a2e", zIndex: 25, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a1a2e" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f0f0f0", fontFamily: "'Space Grotesk', sans-serif" }}>Top 20 by Market Cap</div>
              <div style={{ fontSize: 11, color: "#555", fontFamily: "'SF Mono', monospace", marginTop: 4 }}>ranked by market capitalization</div>
            </div>
            <button onClick={() => setShowTop20(false)} style={{ background: "none", border: "1px solid #222", color: "#666", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {top20Coins.map((coin) => {
              const ch = coin.price_change_percentage_24h || 0;
              const colors = getBubbleColor(ch);
              const isGainer = ch >= 0;
              return (
                <div key={coin.id} onClick={() => { setSelected(coin); setShowTop20(false); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#ffffff08")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ width: 28, fontSize: 13, fontWeight: 700, color: "#444", fontFamily: "'SF Mono', monospace", textAlign: "right", flexShrink: 0 }}>
                    {coin.market_cap_rank}
                  </div>
                  <img src={coin.image} alt="" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", fontFamily: "'Space Grotesk', sans-serif" }}>{coin.name}</span>
                      <span style={{ fontSize: 11, color: "#555", fontFamily: "'SF Mono', monospace" }}>{coin.symbol}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#666", fontFamily: "'SF Mono', monospace", marginTop: 2 }}>
                      MCap {formatMcap(coin.market_cap)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0", fontFamily: "'SF Mono', monospace" }}>
                      {formatPrice(coin.current_price)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.bg, fontFamily: "'SF Mono', monospace", marginTop: 2 }}>
                      {isGainer ? "+" : ""}{ch.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={fetchData} style={{ position: "absolute", bottom: selected ? 110 : 16, left: 16, background: "#7C4DFF15", border: "1px solid #7C4DFF33", color: "#7C4DFF", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'SF Mono', monospace", transition: "all 0.3s", zIndex: 15 }}>↻ Refresh</button>

      <div style={{ position: "absolute", bottom: selected ? 110 : 16, right: 16, fontSize: 10, color: "#333", fontFamily: "'SF Mono', monospace", display: "flex", alignItems: "center", gap: 6, transition: "bottom 0.3s" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00E676", display: "inline-block" }} />
        live · CoinGecko API
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }
      `}</style>
    </div>
  );
}

function generateDemoData(): Coin[] {
  const names = [
    { id: "bitcoin", symbol: "BTC", name: "Bitcoin", p: 67432, mc: 1.32e12, r: 1 },
    { id: "ethereum", symbol: "ETH", name: "Ethereum", p: 3521, mc: 4.23e11, r: 2 },
    { id: "tether", symbol: "USDT", name: "Tether", p: 1.0, mc: 1.12e11, r: 3 },
    { id: "binancecoin", symbol: "BNB", name: "BNB", p: 612, mc: 9.1e10, r: 4 },
    { id: "solana", symbol: "SOL", name: "Solana", p: 172, mc: 7.6e10, r: 5 },
    { id: "ripple", symbol: "XRP", name: "XRP", p: 0.52, mc: 2.8e10, r: 6 },
    { id: "usd-coin", symbol: "USDC", name: "USD Coin", p: 1.0, mc: 2.6e10, r: 7 },
    { id: "cardano", symbol: "ADA", name: "Cardano", p: 0.45, mc: 1.6e10, r: 8 },
    { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", p: 0.15, mc: 2.1e10, r: 9 },
    { id: "avalanche-2", symbol: "AVAX", name: "Avalanche", p: 36, mc: 1.3e10, r: 10 },
    { id: "polkadot", symbol: "DOT", name: "Polkadot", p: 7.2, mc: 1.0e10, r: 11 },
    { id: "tron", symbol: "TRX", name: "TRON", p: 0.12, mc: 1.1e10, r: 12 },
    { id: "chainlink", symbol: "LINK", name: "Chainlink", p: 14.5, mc: 8.5e9, r: 13 },
    { id: "matic-network", symbol: "MATIC", name: "Polygon", p: 0.72, mc: 7.1e9, r: 14 },
    { id: "shiba-inu", symbol: "SHIB", name: "Shiba Inu", p: 0.000025, mc: 1.5e10, r: 15 },
    { id: "litecoin", symbol: "LTC", name: "Litecoin", p: 84, mc: 6.3e9, r: 16 },
    { id: "uniswap", symbol: "UNI", name: "Uniswap", p: 7.8, mc: 5.9e9, r: 17 },
    { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash", p: 432, mc: 8.5e9, r: 18 },
    { id: "cosmos", symbol: "ATOM", name: "Cosmos", p: 9.1, mc: 3.5e9, r: 19 },
    { id: "stellar", symbol: "XLM", name: "Stellar", p: 0.12, mc: 3.4e9, r: 20 },
    { id: "near", symbol: "NEAR", name: "NEAR", p: 5.4, mc: 5.6e9, r: 21 },
    { id: "filecoin", symbol: "FIL", name: "Filecoin", p: 5.1, mc: 2.8e9, r: 22 },
    { id: "arbitrum", symbol: "ARB", name: "Arbitrum", p: 1.1, mc: 3.5e9, r: 23 },
    { id: "optimism", symbol: "OP", name: "Optimism", p: 2.3, mc: 2.7e9, r: 24 },
    { id: "sui", symbol: "SUI", name: "Sui", p: 1.45, mc: 1.8e9, r: 25 },
    { id: "aptos", symbol: "APT", name: "Aptos", p: 8.2, mc: 3.2e9, r: 26 },
    { id: "render-token", symbol: "RNDR", name: "Render", p: 7.6, mc: 2.9e9, r: 27 },
    { id: "injective", symbol: "INJ", name: "Injective", p: 24, mc: 2.2e9, r: 28 },
    { id: "aave", symbol: "AAVE", name: "Aave", p: 92, mc: 1.3e9, r: 29 },
    { id: "maker", symbol: "MKR", name: "Maker", p: 1480, mc: 1.3e9, r: 30 },
    { id: "the-graph", symbol: "GRT", name: "The Graph", p: 0.22, mc: 2.1e9, r: 31 },
    { id: "hedera", symbol: "HBAR", name: "Hedera", p: 0.073, mc: 2.6e9, r: 32 },
    { id: "algorand", symbol: "ALGO", name: "Algorand", p: 0.18, mc: 1.5e9, r: 33 },
    { id: "vechain", symbol: "VET", name: "VeChain", p: 0.028, mc: 2.0e9, r: 34 },
    { id: "eos", symbol: "EOS", name: "EOS", p: 0.78, mc: 0.9e9, r: 35 },
    { id: "fantom", symbol: "FTM", name: "Fantom", p: 0.41, mc: 1.2e9, r: 36 },
    { id: "theta", symbol: "THETA", name: "Theta", p: 1.05, mc: 1.05e9, r: 37 },
    { id: "sandbox", symbol: "SAND", name: "Sandbox", p: 0.44, mc: 0.98e9, r: 38 },
    { id: "axie-infinity", symbol: "AXS", name: "Axie", p: 7.1, mc: 0.96e9, r: 39 },
    { id: "decentraland", symbol: "MANA", name: "Decentraland", p: 0.41, mc: 0.77e9, r: 40 },
    { id: "gala", symbol: "GALA", name: "Gala", p: 0.025, mc: 0.89e9, r: 41 },
    { id: "flow", symbol: "FLOW", name: "Flow", p: 0.72, mc: 0.75e9, r: 42 },
    { id: "stacks", symbol: "STX", name: "Stacks", p: 2.1, mc: 3.0e9, r: 43 },
    { id: "sei", symbol: "SEI", name: "Sei", p: 0.48, mc: 1.3e9, r: 44 },
    { id: "celestia", symbol: "TIA", name: "Celestia", p: 8.9, mc: 1.7e9, r: 45 },
    { id: "pepe", symbol: "PEPE", name: "Pepe", p: 0.0000011, mc: 4.6e9, r: 46 },
    { id: "bonk", symbol: "BONK", name: "Bonk", p: 0.000022, mc: 1.4e9, r: 47 },
    { id: "wif", symbol: "WIF", name: "dogwifhat", p: 2.8, mc: 2.8e9, r: 48 },
    { id: "jupiter", symbol: "JUP", name: "Jupiter", p: 0.82, mc: 1.1e9, r: 49 },
    { id: "pyth", symbol: "PYTH", name: "Pyth", p: 0.38, mc: 0.57e9, r: 50 },
  ];
  const extraNames = ["FLOKI","IMX","QNT","RUNE","FET","AGIX","OCEAN","SNX","CRV","LDO","RPL","GMX","BLUR","PENDLE","ENS","COMP","BAL","SUSHI","YFI","1INCH","DYDX","MASK","API3","BAND","ANKR","CELO","ZIL","IOTA","KAVA","KSM","MINA","CFX","ROSE","ZEC","DASH","NEO","XTZ","EGLD","ONE","AUDIO","RAD","SKL","CTSI","ACH","BICO","RLC","NKN","OGN","REQ","ATA"];
  const extra: Coin[] = extraNames.map((sym, i) => ({ id: sym.toLowerCase(), symbol: sym, name: sym, image: "", current_price: Math.random() * 50 + 0.1, market_cap: Math.random() * 1e9 + 1e7, market_cap_rank: 51 + i, price_change_percentage_24h: (Math.random() - 0.5) * 20, total_volume: Math.random() * 5e8 }));
  return [
    ...names.map((n) => ({ id: n.id, symbol: n.symbol, name: n.name, image: `https://assets.coingecko.com/coins/images/${n.r}/small/${n.id}.png`, current_price: n.p, market_cap: n.mc, market_cap_rank: n.r, price_change_percentage_24h: (Math.random() - 0.5) * 16, total_volume: n.mc * (0.02 + Math.random() * 0.05) })),
    ...extra,
  ];
}
