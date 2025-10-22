import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  BarChart3,
  Calendar,
  Play,
  Square,
  RotateCcw,
  Award,
  Info,
  Lightbulb,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

/**
 * Mega-Sena Dashboard + Simulador + Consultador
 * Todas as funcionalidades mantidas
 * Layout aprimorado + textos explicativos + áreas AdSense
 */

const DATA_URL =
  "https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/megasena.json";
const ANALYTIC_URL =
  "https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/megasena.analytic.json";
const ALT_BASE = "https://loteriascaixa-api.herokuapp.com/api";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function computeWidthPct(max, count) {
  const pct = (count / max) * 100;
  return `${Math.max(0, Math.min(100, pct))}%`;
}

/* ============================================================
   Hook: Dados Mega-Sena (histórico + últimos concursos)
   ============================================================ */
function useMegasenaData() {
  const [raw, setRaw] = useState({});
  const [analytic, setAnalytic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [lastOfficialNumbers, setLastOfficialNumbers] = useState([]);
  const [lastPrizeBreakdown, setLastPrizeBreakdown] = useState([]);
  const [lastOfficialContest, setLastOfficialContest] = useState(null);
  const [nextEstPrize, setNextEstPrize] = useState(null);
  const [acumulado, setAcumulado] = useState(null);
  const [nextDate, setNextDate] = useState(null);

  const parseMoneyBR = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/[^\d,.-]/g, "");
    const num = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(num) ? num : null;
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawResp, anaResp] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(ANALYTIC_URL, { cache: "no-store" }),
      ]);
      const rawJson = await rawResp.json();
      const anaJson = await anaResp.json();
      setRaw(rawJson);
      setAnalytic(anaJson);

      const alt = await fetch(`${ALT_BASE}/megasena/latest`);
      if (alt.ok) {
        const j = await alt.json();
        setLastOfficialContest(j.concurso);
        setLastOfficialNumbers(j.dezenas.map((n) => Number(n)));
        setNextEstPrize(parseMoneyBR(j.valorEstimadoProximoConcurso));
        setAcumulado(Boolean(j.acumulado));
        setNextDate(j.dataProximoConcurso);
        if (j.premiacoes) setLastPrizeBreakdown(j.premiacoes);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const contests = useMemo(() => Object.keys(raw).map(Number).sort((a, b) => a - b), [raw]);
  const totalDraws = contests.length;

  const freq = useMemo(() => {
    const f = {};
    for (let i = 1; i <= 60; i++) f[pad2(i)] = 0;
    for (const arr of Object.values(raw)) {
      for (const n of arr) f[pad2(n)]++;
    }
    return f;
  }, [raw]);

  const hasSubset = (drawArr, targetArr) => {
    const set = new Set(drawArr);
    return targetArr.every((t) => set.has(t));
  };

  return {
    raw,
    analytic,
    fetchAll,
    loading,
    error,
    freq,
    totalDraws,
    lastOfficialNumbers,
    lastPrizeBreakdown,
    lastOfficialContest,
    nextEstPrize,
    acumulado,
    nextDate,
    hasSubset,
  };
}

/* ============================================================
   Hook: Simulador 6×60 (loop controlado)
   ============================================================ */
function useSimulator() {
  const [freq, setFreq] = useState(Array(61).fill(0));
  const [total, setTotal] = useState(0);
  const [lastDraw, setLastDraw] = useState([]);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState(5000);
  const [intervalMs, setIntervalMs] = useState(50);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [limitTotal, setLimitTotal] = useState(100000);
  const [stoppedByLimit, setStoppedByLimit] = useState(false);
  const totalRef = useRef(0);
  const timerRef = useRef(null);

  const sorteio6 = () => {
    const s = new Set();
    while (s.size < 6) s.add(1 + Math.floor(Math.random() * 60));
    return Array.from(s);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const step = () => {
    const remaining = limitEnabled ? Math.max(0, limitTotal - totalRef.current) : Infinity;
    const toRun = Math.min(batch, remaining);
    if (toRun <= 0) {
      setRunning(false);
      setStoppedByLimit(true);
      clearTimer();
      return;
    }

    setFreq((prev) => {
      const f = prev.slice();
      let last = [];
      for (let i = 0; i < toRun; i++) {
        const s = sorteio6();
        last = s;
        for (const n of s) f[n]++;
      }
      setLastDraw(last);
      return f;
    });

    totalRef.current += toRun;
    setTotal(totalRef.current);

    if (limitEnabled && totalRef.current >= limitTotal) {
      setRunning(false);
      setStoppedByLimit(true);
      clearTimer();
    }
  };

  const start = () => {
    if (running) return;
    setStoppedByLimit(false);
    setRunning(true);
    step();
    const ms = Math.max(1, Math.min(10000, Number(intervalMs) || 1));
    timerRef.current = setInterval(step, ms);
  };

  const stop = () => {
    setRunning(false);
    clearTimer();
  };

  const reset = () => {
    stop();
    setFreq(Array(61).fill(0));
    setTotal(0);
    totalRef.current = 0;
    setLastDraw([]);
    setStoppedByLimit(false);
  };

  useEffect(() => () => clearTimer(), []);

  const sum = useMemo(() => freq.reduce((a, b) => a + b, 0), [freq]);
  const top6 = useMemo(() => {
    const arr = [];
    for (let n = 1; n <= 60; n++) arr.push({ n, v: freq[n] });
    arr.sort((a, b) => b.v - a.v);
    return arr.slice(0, 6);
  }, [freq]);

  return {
    freq,
    total,
    lastDraw,
    running,
    batch,
    setBatch,
    intervalMs,
    setIntervalMs,
    start,
    stop,
    reset,
    sum,
    top6,
    limitEnabled,
    setLimitEnabled,
    limitTotal,
    setLimitTotal,
    stoppedByLimit,
  };
}
/* ============================================================
   Componentes visuais (melhorados)
   ============================================================ */
   function Balls({ numbers }) {
    return (
      <div className="flex flex-wrap gap-2 justify-center">
        {numbers.map((n) => (
          <div
            key={n}
            className="w-10 h-10 rounded-full grid place-items-center font-bold text-gray-900"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, #fff, #e3ecff 60%, #d6e0ff 100%)",
              boxShadow: "inset 0 -3px 8px rgba(0,0,0,.2)",
              border: "1px solid rgba(0,0,0,.15)",
            }}
          >
            {pad2(n)}
          </div>
        ))}
      </div>
    );
  }
  
  function TopNumbers({ freq, topN = 6 }) {
    const ranking = useMemo(() => {
      return Object.entries(freq)
        .map(([k, v]) => [k, Number(v)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
    }, [freq, topN]);
  
    const max = ranking.length ? ranking[0][1] : 0;
  
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ranking.map(([n, c]) => {
          const widthPct = computeWidthPct(max, c);
          return (
            <div
              key={n}
              className="flex items-center gap-3 p-3 rounded-2xl bg-[#141a40] text-white shadow-sm border border-white/10"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold bg-[#1a2450] text-white">
                {n}
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#b6c2e6]">vezes</div>
                <div className="font-semibold text-lg">{c}</div>
              </div>
              <div className="h-2 flex-1 rounded-full bg-[#1a2450] overflow-hidden">
                <div
                  className="h-2 bg-gradient-to-r from-[#7aa7ff] to-[#67d38a]"
                  style={{ width: widthPct }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  
  /* ============================================================
     Geração de combinações entre os números mais sorteados
     ============================================================ */
  function kCombinations(arr, k) {
    const res = [];
    const n = arr.length;
    if (k > n || k <= 0) return res;
    const idx = Array.from({ length: k }, (_, i) => i);
    const pick = () => idx.map((i) => arr[i]);
    res.push(pick());
    while (true) {
      let i = k - 1;
      while (i >= 0 && idx[i] === n - k + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
      res.push(pick());
    }
    return res;
  }
  
  function TopCombosFromTopN({ raw, freq, totalDraws, topN }) {
    const topList = useMemo(() => {
      return Object.entries(freq)
        .map(([k, v]) => [k, Number(v)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(1, Math.min(60, Number(topN) || 6)))
        .map(([k]) => k);
    }, [freq, topN]);
  
    const { byK } = useMemo(() => {
      const top = topList.slice(0, 16);
      const setTop = new Set(top);
      const result = { 2: new Map(), 3: new Map(), 4: new Map(), 5: new Map(), 6: new Map() };
      for (const arr of Object.values(raw)) {
        const draw = arr.map((n) => pad2(n)).sort();
        const inter = draw.filter((d) => setTop.has(d));
        for (let k = 2; k <= Math.min(6, inter.length); k++) {
          for (const c of kCombinations(inter, k)) {
            const id = c.join("-");
            const m = result[k];
            m.set(id, (m.get(id) || 0) + 1);
          }
        }
      }
      const out = {};
      for (let k = 2; k <= 6; k++) {
        const entries = Array.from(result[k].entries()).map(([combo, count]) => ({
          combo: combo.split("-"),
          count,
        }));
        entries.sort((a, b) => b.count - a.count);
        out[k] = entries;
      }
      return { byK: out };
    }, [raw, topList]);
  
    return (
      <div className="mt-6 bg-[#111830] border border-white/10 rounded-2xl p-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
          Combinações mais frequentes entre os {topN} números mais sorteados
        </h3>
        <p className="text-sm text-[#b6c2e6] mb-4">
          Aqui você vê quais pares, trios ou grupos de 4 a 6 números costumam aparecer juntos.
        </p>
        <div className="max-h-[400px] overflow-auto space-y-3">
          {[2, 3, 4, 5, 6].map((k) => (
            <div key={k}>
              <h4 className="text-sm font-semibold text-[#7aa7ff] mb-1">
                Combinações de {k} números
              </h4>
              {byK[k] && byK[k].length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0d1430]">
                    <tr>
                      <th className="text-left py-2 px-2">Combinação</th>
                      <th className="text-right py-2 px-2">Vezes</th>
                      <th className="text-right py-2 px-2">% dos sorteios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byK[k].slice(0, 10).map((row, idx) => {
                      const pct = totalDraws ? (100 * row.count) / totalDraws : 0;
                      return (
                        <tr
                          key={idx}
                          className="border-b border-dashed border-white/10"
                        >
                          <td className="py-1.5 px-2">
                            <div className="flex flex-wrap gap-1">
                              {row.combo.map((n) => (
                                <span
                                  key={n}
                                  className="inline-flex w-7 h-7 rounded-full bg-[#1a2450] justify-center items-center text-xs font-bold"
                                >
                                  {n}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="text-right py-1.5 px-2">{row.count}</td>
                          <td className="text-right py-1.5 px-2">
                            {pct.toFixed(3)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-[#b6c2e6]">Sem combinações registradas.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  /* ============================================================
     Consultador de resultados (2 a 6 números)
     ============================================================ */
  function normalize2to6(numbers) {
    const arr = numbers
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 60);
    const uniq = Array.from(new Set(arr));
    if (uniq.length < 2 || uniq.length > 6) return null;
    return uniq.sort((a, b) => a - b).map((n) => pad2(n));
  }
  
  function Consultador({ raw, analytic, hasSubset }) {
    const dateMap = useMemo(() => {
      const m = new Map();
      for (const d of analytic?.draws || []) m.set(Number(d.concurso), d.data);
      return m;
    }, [analytic]);
  
    const [nums, setNums] = useState(["", "", "", "", "", ""]);
    const [paste, setPaste] = useState("");
    const [result, setResult] = useState(null);
    const [err, setErr] = useState(null);
  
    const setFromPaste = () => {
      const parts = paste.split(/[^0-9]+/g).filter(Boolean).slice(0, 6);
      const next = nums.slice();
      for (let i = 0; i < parts.length; i++) next[i] = parts[i];
      setNums(next);
    };
  
    const consultar = () => {
      setErr(null);
      const normalized = normalize2to6(nums);
      if (!normalized) {
        setErr("Informe entre 2 e 6 números distintos entre 1 e 60.");
        return;
      }
      const hits = [];
      for (const [k, arr] of Object.entries(raw)) {
        const draw = arr.map((n) => pad2(n)).sort();
        if (hasSubset(draw, normalized))
          hits.push({ concurso: k, data: dateMap.get(Number(k)) || "—" });
      }
      setResult({ key: normalized.join("-"), hits });
    };
  
    return (
      <div className="mt-6 bg-[#111830] border border-white/10 rounded-2xl p-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
          Consultar combinações
        </h3>
        <p className="text-sm text-[#b6c2e6] mb-2">
          Digite de 2 a 6 números para verificar se já foram sorteados juntos em algum concurso.
        </p>
  
        <div className="grid grid-cols-3 gap-2 mb-2">
          {nums.map((val, i) => (
            <Input
              key={i}
              type="number"
              min={1}
              max={60}
              value={val}
              onChange={(e) => {
                const next = nums.slice();
                next[i] = e.target.value;
                setNums(next);
              }}
              className="bg-[#0c1330] text-white border-white/20"
            />
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          <Input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Cole aqui… (ex: 5 12 23 34 45 56)"
            className="bg-[#0c1330] text-white border-white/20"
          />
          <Button
            onClick={setFromPaste}
            className="bg-gradient-to-r from-[#7aa7ff] to-[#67d38a] font-bold text-[#0b1020]"
          >
            Preencher
          </Button>
        </div>
        <div className="flex gap-2 mb-3">
          <Button
            onClick={consultar}
            className="bg-gradient-to-r from-[#67d38a] to-[#42d0a0] font-bold text-[#0b1020]"
          >
            Consultar
          </Button>
          <Button
            onClick={() => {
              setNums(["", "", "", "", "", ""]);
              setPaste("");
              setResult(null);
              setErr(null);
            }}
            className="bg-gradient-to-r from-[#9aa7ff] to-[#7aa7ff] font-bold text-[#0b1020]"
          >
            Limpar
          </Button>
        </div>
  
        {err && <div className="text-sm text-red-300">{err}</div>}
  
        {result && (
          <div className="bg-[#0e1530] border border-white/10 rounded-xl p-3">
            {result.hits.length > 0 ? (
              <div>
                <p className="text-sm mb-2 text-[#b6c2e6]">
                  A combinação <b>{result.key}</b> apareceu em{" "}
                  <b>{result.hits.length}</b> concurso(s):
                </p>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0d1430]">
                    <tr>
                      <th className="text-left py-2 px-2">Concurso</th>
                      <th className="text-left py-2 px-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.hits.map((h) => (
                      <tr
                        key={h.concurso}
                        className="border-b border-dashed border-white/10"
                      >
                        <td className="py-1.5 px-2">{h.concurso}</td>
                        <td className="py-1.5 px-2">{h.data}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[#b6c2e6]">
                Nenhum sorteio encontrado com essa combinação.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  /* ============================================================
   App principal com layout completo e blocos de anúncios
   ============================================================ */
export default function App() {
    const {
      raw,
      analytic,
      fetchAll,
      loading,
      error,
      freq,
      totalDraws,
      lastOfficialNumbers,
      lastPrizeBreakdown,
      lastOfficialContest,
      nextEstPrize,
      acumulado,
      nextDate,
      hasSubset,
    } = useMegasenaData();
  
    const sim = useSimulator();
    const [topN, setTopN] = useState(6);
  
    const chartData = useMemo(
      () => Object.entries(freq).map(([n, c]) => ({ dezena: n, vezes: Number(c) })),
      [freq]
    );
  
    const fmtBRL = (v) =>
      (Number(v) || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      });
  
    const officialTable = [
      { n: 6, price: 6.0, odds: 50063860 },
      { n: 7, price: 35.0, odds: 7151980 },
      { n: 8, price: 140.0, odds: 1787995 },
      { n: 9, price: 420.0, odds: 595998 },
      { n: 10, price: 1050.0, odds: 238399 },
      { n: 11, price: 2310.0, odds: 108363 },
      { n: 12, price: 4620.0, odds: 54182 },
      { n: 13, price: 8580.0, odds: 29175 },
      { n: 14, price: 15015.0, odds: 16671 },
      { n: 15, price: 25025.0, odds: 10003 },
      { n: 16, price: 40040.0, odds: 6252 },
      { n: 17, price: 61880.0, odds: 4045 },
      { n: 18, price: 92820.0, odds: 2697 },
      { n: 19, price: 135660.0, odds: 1845 },
      { n: 20, price: 193800.0, odds: 1292 },
    ];
  
    return (
      <div className="min-h-screen bg-[#0b1020] text-[#e8eefc]">
        <header className="bg-[#111830] py-5 text-center shadow-md border-b border-[#1a2448]">
          <h1 className="text-3xl font-extrabold flex justify-center items-center gap-2 text-white">
            <BarChart3 className="w-7 h-7 text-[#67d38a]" />
            Mega-Sena • Painel Completo
          </h1>
          <p className="text-[#b6c2e6] text-sm">
            Resultados oficiais, simulação e estatísticas em tempo real.
          </p>
        </header>
  
        {/* ======== ADSENSE SUPERIOR ======== */}
        <div className="flex justify-center py-4">
          {/* ADSENSE_TOP */}
        </div>
  
        <main className="max-w-6xl mx-auto p-6 space-y-6">
          {/* =============================
             BLOCO 1: Resultados Oficiais
             ============================= */}
          <Card className="bg-[#111830] border border-[#1a2448] rounded-2xl shadow-xl">
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#67d38a]" />
                <h2 className="text-xl font-bold text-white">Resultados Oficiais</h2>
              </div>
              <p className="text-sm text-[#b6c2e6]">
                Carregue os dados oficiais e veja as últimas dezenas, valores de prêmios
                e o status do próximo concurso.
              </p>
  
              <Button
                onClick={fetchAll}
                disabled={loading}
                className="bg-gradient-to-r from-[#67d38a] to-[#42d0a0] font-extrabold text-[#0b1020]"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                  </span>
                ) : (
                  "Carregar resultados oficiais"
                )}
              </Button>
  
              {error && (
                <div className="p-3 bg-red-800/40 rounded-lg text-sm text-red-200 border border-red-400/30">
                  Erro: {error}
                </div>
              )}
  
              {lastOfficialContest && (
                <div className="bg-[#141a40] border border-white/10 rounded-xl p-3 space-y-3">
                  <div className="text-sm flex flex-wrap items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Concurso <b>{lastOfficialContest}</b>
                      {nextDate && (
                        <>
                          {" • "}Próximo sorteio:{" "}
                          <b className="text-[#67d38a]">{nextDate}</b>
                        </>
                      )}
                      {acumulado != null && (
                        <>
                          {" • "}Acumulado:{" "}
                          <b className="text-white">
                            {acumulado ? "Sim" : "Não"}
                          </b>
                        </>
                      )}
                      {nextEstPrize && (
                        <>
                          {" • "}Prêmio estimado:{" "}
                          <b className="text-[#7aa7ff]">
                            {fmtBRL(nextEstPrize)}
                          </b>
                        </>
                      )}
                    </span>
                  </div>
  
                  <div>
                    <div className="text-xs text-[#b6c2e6] mb-1">Dezenas sorteadas</div>
                    <Balls numbers={lastOfficialNumbers} />
                  </div>
  
                  {lastPrizeBreakdown?.length > 0 && (
                    <div>
                      <div className="text-xs text-[#b6c2e6] mb-1">Premiações</div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[#0d1430]">
                          <tr>
                            <th className="text-left py-2 px-2">Faixa</th>
                            <th className="text-right py-2 px-2">Ganhadores</th>
                            <th className="text-right py-2 px-2">Prêmio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lastPrizeBreakdown.map((p, i) => (
                            <tr
                              key={i}
                              className="border-b border-dashed border-white/10"
                            >
                              <td className="py-1.5 px-2">{p.faixa}</td>
                              <td className="py-1.5 px-2 text-right">
                                {p.vencedores != null
                                  ? p.vencedores.toLocaleString("pt-BR")
                                  : "—"}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {p.premio != null ? fmtBRL(p.premio) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
  
          {/* ======== ADSENSE ENTRE SEÇÕES ======== */}
          <div className="flex justify-center py-4">{/* ADSENSE_MIDDLE */}</div>
  
          {/* =============================
             BLOCO 2: Estatísticas e Combinações
             ============================= */}
          {totalDraws > 0 && (
            <>
              <Card className="bg-[#111830] border border-[#1a2448] rounded-2xl shadow-xl">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#7aa7ff]" />
                    <h2 className="text-xl font-bold text-white">
                      Estatísticas de Sorteios
                    </h2>
                  </div>
                  <p className="text-sm text-[#b6c2e6]">
                    Veja quais números mais saíram na história e suas combinações
                    mais frequentes.
                  </p>
  
                  <label className="text-sm">
                    <span className="text-[#b6c2e6]">Top N:</span>{" "}
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={topN}
                      onChange={(e) =>
                        setTopN(
                          Math.min(60, Math.max(1, Number(e.target.value) || 6))
                        )
                      }
                      className="w-20 bg-[#0c1330] text-white border-white/20 ml-2"
                    />
                  </label>
  
                  <TopNumbers freq={freq} topN={topN} />
  
                  <div className="h-80 bg-[#0e1530] border border-white/10 rounded-xl p-2 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis
                          dataKey="dezena"
                          tick={{ fontSize: 10, fill: "#b6c2e6" }}
                        />
                        <YAxis tick={{ fill: "#b6c2e6" }} />
                        <Tooltip
                          formatter={(v) => [v, "vezes"]}
                          contentStyle={{
                            background: "#0e1530",
                            border: "1px solid rgba(255,255,255,.12)",
                            color: "#e8eefc",
                          }}
                        />
                        <Bar dataKey="vezes" fill="#7aa7ff" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
  
                  <TopCombosFromTopN
                    raw={raw}
                    freq={freq}
                    totalDraws={totalDraws}
                    topN={topN}
                  />
  
                  <Consultador
                    raw={raw}
                    analytic={analytic}
                    hasSubset={hasSubset}
                  />
                </CardContent>
              </Card>
            </>
          )}
  
          {/* =============================
             BLOCO 3: Simulador 6×60
             ============================= */}
          <Card className="bg-[#111830] border border-[#1a2448] rounded-2xl shadow-xl">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-[#67d38a]" />
                Simulador 6×60 • Sorteios automáticos
              </h2>
              <p className="text-sm text-[#b6c2e6]">
                Gere sorteios aleatórios em loop e veja a frequência de cada número.
                Ideal para testar probabilidades reais.
              </p>
  
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={sim.start}
                  disabled={sim.running}
                  className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#67d38a] to-[#42d0a0]"
                >
                  <Play className="w-4 h-4 mr-1" /> Iniciar
                </Button>
                <Button
                  onClick={sim.stop}
                  disabled={!sim.running}
                  className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#ff6b6b] to-[#ff8b6b]"
                >
                  <Square className="w-4 h-4 mr-1" /> Parar
                </Button>
                <Button
                  onClick={sim.reset}
                  className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#9aa7ff] to-[#7aa7ff]"
                >
                  <RotateCcw className="w-4 h-4 mr-1" /> Resetar
                </Button>
              </div>
  
              <div className="flex flex-wrap gap-4 items-center">
                <label className="text-sm flex items-center gap-2">
                  Iterações:
                  <Input
                    type="number"
                    value={sim.batch}
                    onChange={(e) =>
                      sim.setBatch(
                        Math.max(1, Math.min(50000, Number(e.target.value)))
                      )
                    }
                    className="w-24 bg-[#0c1330] text-white border-white/20"
                  />
                </label>
                <label className="text-sm flex items-center gap-2">
                  Intervalo (ms):
                  <Input
                    type="number"
                    value={sim.intervalMs}
                    onChange={(e) =>
                      sim.setIntervalMs(
                        Math.max(1, Math.min(10000, Number(e.target.value)))
                      )
                    }
                    className="w-24 bg-[#0c1330] text-white border-white/20"
                  />
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sim.limitEnabled}
                    onChange={(e) => sim.setLimitEnabled(e.target.checked)}
                    className="accent-[#67d38a]"
                  />
                  Limitar a:
                  <Input
                    type="number"
                    disabled={!sim.limitEnabled}
                    value={sim.limitTotal}
                    onChange={(e) =>
                      sim.setLimitTotal(
                        Math.max(1, Math.min(100000000, Number(e.target.value)))
                      )
                    }
                    className="w-36 bg-[#0c1330] text-white border-white/20"
                  />
                </label>
              </div>
  
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="bg-[#0c1330] p-3 rounded-xl border border-white/10">
                  <div className="text-xs text-[#b6c2e6]">Total de sorteios</div>
                  <div className="text-2xl font-black">
                    {sim.total.toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="bg-[#0c1330] p-3 rounded-xl border border-white/10">
                  <div className="text-xs text-[#b6c2e6]">Aparições totais</div>
                  <div className="text-2xl font-black">
                    {sim.sum.toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="bg-[#0c1330] p-3 rounded-xl border border-white/10">
                  <div className="text-xs text-[#b6c2e6]">Progresso</div>
                  <div className="text-2xl font-black">
                    {sim.limitEnabled
                      ? `${Math.min(sim.total, sim.limitTotal).toLocaleString(
                          "pt-BR"
                        )} / ${sim.limitTotal.toLocaleString("pt-BR")}`
                      : "—"}
                  </div>
                </div>
              </div>
  
              <div>
                <p className="text-xs text-[#b6c2e6] mb-2">
                  Top 6 números mais sorteados:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {sim.top6.map((o) => (
                    <div
                      key={o.n}
                      className="w-10 h-10 rounded-full grid place-items-center font-bold text-gray-900"
                      style={{
                        background:
                          "radial-gradient(circle at 30% 30%, #fff, #e3ecff 60%, #d6e0ff 100%)",
                        boxShadow: "inset 0 -3px 8px rgba(0,0,0,.2)",
                      }}
                    >
                      {pad2(o.n)}
                    </div>
                  ))}
                </div>
              </div>
  
              <div className="bg-[#0c1330] border border-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-gradient-to-r from-[#7aa7ff] to-[#67d38a]"
                  style={{
                    transform: sim.running ? "translateX(0)" : "translateX(-100%)",
                    transition: "transform .3s ease",
                  }}
                />
              </div>
  
              <div className="bg-[#0e1530] border border-white/10 rounded-xl p-3 max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0d1430]">
                    <tr>
                      <th className="text-left py-2 px-2">Número</th>
                      <th className="text-right py-2 px-2">Vezes</th>
                      <th className="text-right py-2 px-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => {
                      const v = sim.freq[n] || 0;
                      const pct = sim.sum ? (100 * v) / sim.sum : 0;
                      return (
                        <tr
                          key={n}
                          className="border-b border-dashed border-white/10"
                        >
                          <td className="py-1.5 px-2">{pad2(n)}</td>
                          <td className="py-1.5 px-2 text-right">
                            {v.toLocaleString("pt-BR")}
                          </td>
                          <td className="py-1.5 px-2 text-right">{pct.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ======== ADSENSE RODAPÉ ======== */}
        <div className="flex justify-center py-4">{/* ADSENSE_BOTTOM */}</div>

        {/* =============================
           BLOCO 4: Tabela de Probabilidades
           ============================= */}
        <Card className="bg-[#111830] border border-[#1a2448] rounded-2xl shadow-xl">
          <CardContent className="p-5">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
              <Info className="w-5 h-5 text-[#7aa7ff]" />
              Probabilidades Oficiais
            </h2>
            <p className="text-sm text-[#b6c2e6] mb-4">
              Tabela oficial com o preço de cada tipo de aposta (6 a 20 números)
              e suas chances de acerto da <b>Sena</b>.
            </p>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0d1430]">
                  <tr>
                    <th className="text-left py-2 px-2">Números</th>
                    <th className="text-right py-2 px-2">Preço</th>
                    <th className="text-right py-2 px-2">Probabilidade (1 em X)</th>
                  </tr>
                </thead>
                <tbody>
                  {officialTable.map((r) => (
                    <tr key={r.n} className="border-b border-dashed border-white/10">
                      <td className="py-1.5 px-2">{r.n}</td>
                      <td className="py-1.5 px-2 text-right">{fmtBRL(r.price)}</td>
                      <td className="py-1.5 px-2 text-right">{r.odds.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#8691b8] mt-2">
              Valores e probabilidades conforme informações da Caixa Econômica Federal.
            </p>
          </CardContent>
        </Card>

        {/* =============================
           RODAPÉ FINAL
           ============================= */}
        <footer className="text-center py-6 text-[#8691b8] text-sm border-t border-[#1a2448] mt-8">
          <div>
            <Lightbulb className="w-4 h-4 inline mr-1 text-[#67d38a]" />
            Painel Mega-Sena aprimorado com simulação e estatísticas.
          </div>
          <div>© 2025 - Projeto educacional e comunitário sem fins lucrativos.</div>
        </footer>
      </main>
    </div>
  );
}
