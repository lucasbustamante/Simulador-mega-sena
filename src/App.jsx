import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, BarChart3, Calendar, Play, Square, RotateCcw,Award,Info, Lightbulb } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";


/**
 * Mega-Sena • Resultados oficiais (API) + Simulador 6×60 (loop contínuo)
 *
 * APIs:
 *  - Histórico (comunitário): https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/megasena.json
 *  - Analítico (comunitário): https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/megasena.analytic.json
 *  - Alternativa (último/por número): https://loteriascaixa-api.herokuapp.com/api
 */

const DATA_URL =
  "https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/megasena.json";
const ANALYTIC_URL =
  "https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/megasena.analytic.json";
const ALT_BASE = "https://loteriascaixa-api.herokuapp.com/api"; // `${ALT_BASE}/megasena/latest` e `${ALT_BASE}/megasena/{n}`

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function computeWidthPct(max, count) {
  const m = Number(max) || 0;
  const c = Number(count) || 0;
  if (m <= 0) return "0%";
  const pct = (c / m) * 100;
  return `${Math.max(0, Math.min(100, pct))}%`;
}

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

/* =====================
   Hook: Dados Mega-Sena
   ===================== */
function useMegasenaData() {
  const [raw, setRaw] = useState({});
  const [analytic, setAnalytic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastDate, setLastDate] = useState(null);

  // Metadados de “próximo”
  const [nextEstPrize, setNextEstPrize] = useState(null);
  const [acumulado, setAcumulado] = useState(null);
  const [nextDate, setNextDate] = useState(null);

  // Último sorteio oficial
  const [lastOfficialNumbers, setLastOfficialNumbers] = useState([]);
  const [lastPrizeBreakdown, setLastPrizeBreakdown] = useState([]); // {faixa, vencedores (number|null), premio (number|null)}
  const [lastOfficialContest, setLastOfficialContest] = useState(null);

  const parseMoneyBR = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const s = String(v).replace(/[^\d,.-]/g, "");
    const num = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(num) ? num : null;
  };

  // Normaliza nomes (“Sena”, “Quina”, “Quadra”, fallback: “Faixa”)
  const normFaixa = (txt) => {
    const t = (txt || "").toString().toUpperCase();
    if (t.includes("SENA")) return "Sena";
    if (t.includes("QUINA")) return "Quina";
    if (t.includes("QUADRA")) return "Quadra";
    return txt || "Faixa";
  };

  // Extrator bem robusto: tenta array “premiacoes” e também varre chaves soltas do objeto.
  function extractPrizeBreakdownFromObj(obj) {
    if (!obj || typeof obj !== "object") return [];

    const out = [];

    // 1) Array “premiacoes”
    if (Array.isArray(obj.premiacoes)) {
      for (const p of obj.premiacoes) {
        const faixa = normFaixa(p.acertos || p.faixa || p.descricao);
        const vencedoresRaw = p.vencedores ?? p.quantidade ?? p.qtd ?? p.ganhadores;
        const premioRaw = p.premio ?? p.valorPremio ?? p.valor ?? p.rateio;
        const vencedores = vencedoresRaw == null ? null : Number(vencedoresRaw);
        const premio = parseMoneyBR(premioRaw);
        out.push({ faixa, vencedores: Number.isFinite(vencedores) ? vencedores : null, premio });
      }
    }

    // 2) Campos soltos com regex
    const entries = Object.entries(obj);
    const findNum = (re) => {
      const hit = entries.find(([k]) => re.test(k));
      if (!hit) return null;
      const v = Number(hit[1]);
      return Number.isFinite(v) ? v : null;
    };
    const findMoney = (re) => {
      const hit = entries.find(([k]) => re.test(k));
      if (!hit) return null;
      return parseMoneyBR(hit[1]);
    };

    const BLOCKS = [
      {
        faixa: "Sena",
        reQtd: /(qt|qtd|ganhadores?).*sena|sena.*(qt|qtd|ganhadores?)/i,
        reVal: /(vl|valor|rateio).*sena|sena.*(vl|valor|rateio)/i,
      },
      {
        faixa: "Quina",
        reQtd: /(qt|qtd|ganhadores?).*quina|quina.*(qt|qtd|ganhadores?)/i,
        reVal: /(vl|valor|rateio).*quina|quina.*(vl|valor|rateio)/i,
      },
      {
        faixa: "Quadra",
        reQtd: /(qt|qtd|ganhadores?).*quadra|quadra.*(qt|qtd|ganhadores?)/i,
        reVal: /(vl|valor|rateio).*quadra|quadra.*(vl|valor|rateio)/i,
      },
    ];

    for (const b of BLOCKS) {
      const vencedores = findNum(b.reQtd);
      const premio = findMoney(b.reVal);
      if (vencedores != null || premio != null) {
        out.push({ faixa: b.faixa, vencedores, premio });
      }
    }

    // 3) Agrupa
    const agg = new Map();
    for (const p of out) {
      const k = p.faixa;
      const prev = agg.get(k) || { faixa: k, vencedores: null, premio: null };
      agg.set(k, {
        faixa: k,
        vencedores: prev.vencedores ?? p.vencedores ?? null,
        premio:
          prev.premio == null
            ? p.premio ?? null
            : p.premio == null
            ? prev.premio
            : Math.max(prev.premio, p.premio),
      });
    }
    return Array.from(agg.values());
  }

  // Fallback analítico: tenta achar premiacoes para um #concurso no arquivo analítico
  function extractPrizeFromAnalytic(anaJson, contestNumber) {
    try {
      const draws = anaJson?.draws || [];
      const hit =
        draws.find((d) => Number(d.concurso) === Number(contestNumber)) ||
        draws
          .slice()
          .reverse()
          .find((d) => d?.premiacoes && Array.isArray(d.premiacoes));
      if (!hit) return [];
      if (Array.isArray(hit.premiacoes)) {
        return hit.premiacoes.map((p) => ({
          faixa: normFaixa(p.acertos || p.faixa || p.descricao),
          vencedores:
            p.vencedores != null
              ? Number(p.vencedores)
              : p.quantidade != null
              ? Number(p.quantidade)
              : p.qtd != null
              ? Number(p.qtd)
              : p.ganhadores != null
              ? Number(p.ganhadores)
              : null,
          premio: parseMoneyBR(p.premio ?? p.valorPremio ?? p.valor ?? p.rateio),
        }));
      }
      return extractPrizeBreakdownFromObj(hit);
    } catch {
      return [];
    }
  }

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Baixa histórico + analítico
      const [rawResp, anaResp] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        fetch(ANALYTIC_URL, { cache: "no-store" }),
      ]);
      if (!rawResp.ok) throw new Error(`Falha ao baixar dados: ${rawResp.status}`);
      if (!anaResp.ok) throw new Error(`Falha ao baixar análises: ${anaResp.status}`);

      const rawJson = await rawResp.json();
      const anaJson = await anaResp.json();

      let augmented = { ...rawJson };

      // ====== pega latest e o próprio concurso por número ======
      let latestObj = null;
      let contestObj = null;
      let latestN = null;

      try {
        const latestResp = await fetch(`${ALT_BASE}/megasena/latest`, { cache: "no-store" });
        if (latestResp.ok) {
          latestObj = await latestResp.json();
          latestN = Number(latestObj?.concurso) || null;

          // por número
          if (latestN) {
            const contestResp = await fetch(`${ALT_BASE}/megasena/${latestN}`, { cache: "no-store" }).catch(() => null);
            if (contestResp?.ok) {
              contestObj = await contestResp.json();
            }
          }

          // completa histórico até latestN
          const existing = Object.keys(augmented).map(Number);
          const lastNBase = existing.length ? Math.max(...existing) : 0;
          if (latestN && latestN > lastNBase) {
            const toFetch = [];
            for (let n = lastNBase + 1; n <= latestN; n++) toFetch.push(n);
            const chunk = async (arr, size = 6) => {
              for (let i = 0; i < arr.length; i += size) {
                const slice = arr.slice(i, i + size);
                const resps = await Promise.all(
                  slice.map((n) => fetch(`${ALT_BASE}/megasena/${n}`, { cache: "no-store" }).catch(() => null))
                );
                const jsons = await Promise.all(resps.map((r) => (r && r.ok ? r.json() : null)));
                for (const j of jsons) {
                  if (!j) continue;
                  const nums = (j.dezenas || []).map((d) => Number(d)).filter((x) => Number.isFinite(x));
                  if (nums.length === 6) augmented[j.concurso] = nums;
                }
              }
            };
            await chunk(toFetch, 6);
          }

          // metadados “próximo”
          setAcumulado(
            typeof latestObj?.acumulado === "boolean"
              ? latestObj.acumulado
              : latestObj?.acumulado != null
              ? Boolean(latestObj.acumulado)
              : null
          );
          const est = latestObj?.valorEstimadoProximoConcurso;
          if (est != null) {
            const norm =
              typeof est === "string"
                ? Number(est.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."))
                : Number(est);
            setNextEstPrize(Number.isFinite(norm) ? norm : null);
          } else setNextEstPrize(null);
          setNextDate(latestObj?.dataProximoConcurso ?? null);
        }
      } catch (e) {
        console.debug("ALT_BASE falhou:", e?.message || e);
      }

      setRaw(augmented);
      setAnalytic(anaJson);

      // Data + dezenas oficiais
      let lastDateTmp = null;
      let lastNumsTmp = [];
      let lastContestTmp = null;
      let prizeTmp = [];

      if (contestObj || latestObj) {
        const base = contestObj?.dezenas?.length ? contestObj : latestObj;
        lastContestTmp = Number(base?.concurso) || null;
        lastDateTmp = base?.data || null;
      
        const nums = (base?.dezenas || []).map((d) => Number(d)).filter((x) => Number.isFinite(x));
        if (nums.length === 6) {
          lastNumsTmp = nums.sort((a, b) => a - b);
        } else {
          // fallback: tenta buscar no histórico JSON
          const fromRaw = augmented[lastContestTmp];
          if (fromRaw?.length === 6) {
            lastNumsTmp = fromRaw.slice().sort((a, b) => a - b);
          }
        }
      
        prizeTmp = extractPrizeBreakdownFromObj(base);
        if ((!prizeTmp || !prizeTmp.length) && lastContestTmp) {
          const p3 = extractPrizeFromAnalytic(anaJson, lastContestTmp);
          if (p3.length) prizeTmp = p3;
        }
      }
      

      // fallbacks
      if (!lastContestTmp) {
        const contests = Object.keys(augmented).map(Number).sort((a, b) => a - b);
        lastContestTmp = contests[contests.length - 1] || null;
      }
      if (!lastDateTmp) {
        const fromAna = anaJson?.draws?.find((d) => Number(d.concurso) === Number(lastContestTmp));
        lastDateTmp = fromAna?.data || null;
      }
      if (!lastNumsTmp.length && lastContestTmp && augmented[lastContestTmp]) {
        lastNumsTmp = (augmented[lastContestTmp] || []).slice().sort((a, b) => a - b);
      }
      if ((!prizeTmp || prizeTmp.length === 0) && lastContestTmp) {
        const p4 = extractPrizeFromAnalytic(anaJson, lastContestTmp);
        if (p4.length) prizeTmp = p4;
      }

      setLastOfficialContest(lastContestTmp);
      setLastDate(lastDateTmp);
      setLastOfficialNumbers(lastNumsTmp);
      setLastPrizeBreakdown(prizeTmp);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const contests = useMemo(() => Object.keys(raw).map(Number).sort((a, b) => a - b), [raw]);
  const lastContest = contests.length ? contests[contests.length - 1] : undefined;

  const freq = useMemo(() => {
    const f = {};
    for (let i = 1; i <= 60; i++) f[pad2(i)] = 0;
    for (const k of Object.keys(raw)) {
      const arr = raw[k] || [];
      for (const d of arr) {
        const n = typeof d === "string" ? parseInt(d, 10) : d;
        if (!Number.isFinite(n)) continue;
        if (n >= 1 && n <= 60) f[pad2(n)]++;
      }
    }
    return f;
  }, [raw]);

  const totalDraws = useMemo(() => Object.keys(raw).length, [raw]);

  const hasSubset = useMemo(() => {
    return (drawArr, targetArr) => {
      const set = new Set(drawArr);
      return targetArr.every((t) => set.has(t));
    };
  }, []);

  return {
    raw,
    analytic,
    fetchAll,
    loading,
    error,
    contests,
    lastContest,
    lastDate,
    freq,
    totalDraws,
    hasSubset,
    nextEstPrize,
    acumulado,
    nextDate,
    lastOfficialNumbers,
    lastPrizeBreakdown,
    lastOfficialContest,
  };
}

/* =====================
   Hook: Simulador 6×60 (com limitador estável)
   ===================== */
function useSimulator() {
  const [freq, setFreq] = useState(Array(61).fill(0));
  const [total, setTotal] = useState(0);
  const totalRef = useRef(0); // estado síncrono p/ parar no limite
  const [lastDraw, setLastDraw] = useState([]);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState(5000);
  const [intervalMs, setIntervalMs] = useState(50); // inicia em 50

  const [limitEnabled, setLimitEnabled] = useState(false);
  const [limitTotal, setLimitTotal] = useState(100000);
  const [stoppedByLimit, setStoppedByLimit] = useState(false);

  const timerRef = useRef(null);

  const sorteio6 = () => {
    const s = new Set();
    while (s.size < 6) s.add(1 + Math.floor(Math.random() * 60));
    return Array.from(s).sort((a, b) => a - b);
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
    if (limitEnabled && totalRef.current >= limitTotal) return;
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

/* =====================
   Componentes de UI
   ===================== */
function Balls({ numbers }) {
  return (
    <div className="flex flex-wrap gap-2">
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
          {String(n).padStart(2, "0")}
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

  const max = ranking.length ? Number(ranking[0][1]) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {ranking.map(([n, c]) => {
        const vv = Number(c) || 0;
        const widthPct = computeWidthPct(max, vv);
        return (
          <div key={n} className="flex items-center gap-3 p-3 rounded-2xl bg-[#0c1330] text-white shadow-sm border border-white/10">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold bg-[#1a2450] text-white">
              {n}
            </div>
            <div className="flex-1">
              <div className="text-sm text-[#b6c2e6]">vezes</div>
              <div className="font-semibold text-lg text-white">{vv}</div>
            </div>
            <div className="h-2 flex-1 rounded-full bg-[#1a2450] overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-[#7aa7ff] to-[#67d38a]" style={{ width: widthPct }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopCombosFromTopN({ raw, freq, totalDraws, topN }) {
  const topList = useMemo(() => {
    return Object.entries(freq)
      .map(([k, v]) => [k, Number(v)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, Math.min(60, Number(topN) || 6)))
      .map(([k]) => k);
  }, [freq, topN]);

  const { byK, warn } = useMemo(() => {
    const maxN = 16;
    const top = topList.slice(0, maxN);
    const setTop = new Set(top);
    const result = { 2: new Map(), 3: new Map(), 4: new Map(), 5: new Map(), 6: new Map() };

    for (const key of Object.keys(raw)) {
      const draw = (raw[key] || []).map((n) => pad2(Number(n))).sort();
      if (draw.length !== 6) continue;
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
      entries.sort((a, b) => b.count - a.count || a.combo.join("-").localeCompare(b.combo.join("-")));
      out[k] = entries;
    }
    return { byK: out, warn: topList.length > maxN };
  }, [raw, topList]);

  return (
    <div className="mt-4 grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 bg-[#0e1530] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
        <div className="text-sm font-semibold">Combinações entre os Top N (k = 2..6)</div>
        <div className="text-xs text-[#b6c2e6]">Geradas apenas a partir dos números visíveis no Top N.</div>
        {warn && <div className="text-xs text-amber-200">Top N muito alto — limitando a 16 internamente para manter a performance.</div>}
      </div>
      <div className="md:col-span-2 bg-[#0e1530] border border-white/10 rounded-xl p-3 max-h-[420px] overflow-auto">
        {[2,3,4,5,6].map((k) => (
          <div key={k} className="mb-4">
            <div className="text-sm font-semibold mb-1">Combinações mais frequentes entre {k} números mais sorteados</div>
            {byK[k] && byK[k].length ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0d1430]">
                  <tr>
                    <th className="text-left py-2 px-2">Combinação</th>
                    <th className="text-right py-2 px-2">Vezes</th>
                    <th className="text-right py-2 px-2">% dos concursos</th>
                  </tr>
                </thead>
                <tbody>
                  {byK[k].slice(0, 12).map((row, idx) => {
                    const pct = totalDraws ? (100 * row.count) / totalDraws : 0;
                    return (
                      <tr key={`${k}-${row.combo.join('-')}-${idx}`} className="border-b border-dashed border-white/10">
                        <td className="text-left py-1.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {row.combo.map((n) => (
                              <span key={n} className="inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-gray-900" style={{background:"radial-gradient(circle at 30% 30%, #fff, #e3ecff 60%, #d6e0ff 100%)", boxShadow:"inset 0 -3px 8px rgba(0,0,0,.2)", border:"1px solid rgba(0,0,0,.15)"}}>
                                {n}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-right py-1.5 px-2">{row.count.toLocaleString('pt-BR')}</td>
                        <td className="text-right py-1.5 px-2">{pct.toFixed(3)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-[#b6c2e6]">Nenhuma combinação encontrada para {k} números.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================
   Testes utilitários (dev)
   ===================== */
function runTopNumbersTests() {
  const f1 = { "01": "10", "02": "5", "03": "0" };
  const r1 = Object.entries(f1).map(([k, v]) => Number(v));
  console.assert(r1.every((x) => typeof x === "number" && !Number.isNaN(x)), "Conversão para número falhou");
  const f2 = { "10": 3, "11": 9 };
  const r2 = Object.entries(f2).map(([k, v]) => Number(v));
  console.assert(r2[1] === 9, "Manter números corretos");
  const f3 = { "01": 0, "02": 0 };
  const max3 = Math.max(...Object.values(f3).map(Number));
  console.assert(max3 === 0, "Max deveria ser 0 quando tudo é 0");
  console.assert(computeWidthPct(0, 10) === "0%", "computeWidthPct max=0");
  console.assert(computeWidthPct(10, 0) === "0%", "computeWidthPct count=0");
  console.assert(computeWidthPct(10, 5) === "50%", "computeWidthPct 5/10");
  const comb = kCombinations([1,2,3,4], 2).map(x => x.join('-'));
  console.assert(JSON.stringify(comb) === JSON.stringify(["1-2","1-3","1-4","2-3","2-4","3-4"]), "kCombinations inválido");
}

function runConsultadorTests() {
  console.assert(normalize2to6([1, 2]).join("-") === "01-02", "normalize2to6 2 itens");
  console.assert(normalize2to6([1,2,3,4,5,6]).join("-") === "01-02-03-04-05-06", "normalize2to6 6 itens");
  console.assert(normalize2to6([1,1]) === null, "normalize2to6 dup");
  console.assert(normalize2to6([0,2]) === null, "normalize2to6 fora range");
}

function runSubsetTests() {
  const fakeRaw = { 1:[1,2,3,4,5,6], 2:[1,4,6,10,20,30], 3:[1,6,55,10,12,14] };
  const norm = (arr)=>arr.map(n=>pad2(n)).sort();
  const has = (draw,target)=>{ const set=new Set(draw); return target.every(t=>set.has(t)); };
  const target1 = norm([1,4,6,55]);
  let c=0; for(const k of Object.keys(fakeRaw)){ const d=norm(fakeRaw[k]); if(has(d,target1)) c++; }
  console.assert(c===1, 'Conjunto 1,4,6,55 deveria ocorrer 1x');
}

// =====================
// 🔎 Consultador (2..6)
// =====================
function normalize2to6(numbers) {
  const arr = (numbers || [])
    .map((n) => Number(String(n).trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 60);
  const uniq = Array.from(new Set(arr));
  if (uniq.length < 2 || uniq.length > 6) return null;
  return uniq.sort((a, b) => a - b).map((n) => pad2(n));
}

function Consultador({ raw, analytic, hasSubset }) {
  const dateMap = useMemo(() => {
    const m = new Map();
    const list = analytic?.draws || [];
    for (const d of list) m.set(Number(d.concurso), d.data);
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
    setResult(null);
    const normalized = normalize2to6(nums);
    if (!normalized) {
      setErr("Informe entre 2 e 6 números distintos entre 1 e 60.");
      return;
    }
    const hits = [];
    for (const k of Object.keys(raw)) {
      const draw = (raw[k] || []).map((n) => pad2(Number(n))).sort();
      if (draw.length !== 6) continue;
      if (hasSubset(draw, normalized)) {
        hits.push({ concurso: Number(k), data: dateMap.get(Number(k)) || null });
      }
    }
    setResult({ key: normalized.join("-"), hits });
  };

  return (
    <div className="mt-4 grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 bg-[#0e1530] border border-white/10 rounded-xl p-3 flex flex-col gap-3">
        <div className="text-sm font-semibold">Consultador de resultados (2 a 6 números)</div>
        <div className="text-xs text-[#b6c2e6]">Ex.: 1 4 6 55 → verifica se esta combinação já apareceu junta.</div>
        <div className="grid grid-cols-3 gap-2">
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
        <div className="text-xs text-[#b6c2e6]">Ou cole uma linha com números (ex.: 5 12 23 34 45 56)</div>
        <div className="flex gap-2">
          <Input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Cole aqui…" className="bg-[#0c1330] text-white border-white/20" />
          <Button onClick={setFromPaste} className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#7aa7ff] to-[#67d38a]">Preencher</Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={consultar} className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#67d38a] to-[#42d0a0]">Consultar</Button>
          <Button onClick={() => { setNums(["", "", "", "", "", ""]); setPaste(""); setResult(null); setErr(null); }} className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#9aa7ff] to-[#7aa7ff]">Limpar</Button>
        </div>
        {err && <div className="text-sm text-red-200">{err}</div>}
      </div>

      <div className="md:col-span-2 bg-[#0e1530] border border-white/10 rounded-xl p-3 max-h-[420px] overflow-auto">
        {result ? (
          result.hits.length ? (
            <div className="space-y-2">
              <div className="text-sm">
                Conjunto <span className="font-semibold">{result.key}</span> encontrado em {" "}
                <span className="font-semibold">{result.hits.length}</span> concurso(s):
              </div>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0d1430]">
                  <tr>
                    <th className="text-left py-2 px-2">Concurso</th>
                    <th className="text-left py-2 px-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hits.sort((a, b) => a.concurso - b.concurso).map((h) => (
                    <tr key={h.concurso} className="border-b border-dashed border-white/10">
                      <td className="text-left py-1.5 px-2">{h.concurso}</td>
                      <td className="text-left py-1.5 px-2">{h.data || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-[#b6c2e6]">Este conjunto <span className="font-semibold text-white">nunca</span> foi sorteado no histórico carregado.</div>
          )
        ) : (
          <div className="text-sm text-[#b6c2e6]">Preencha os números e clique em <span className="text-white font-semibold">Consultar</span>.</div>
        )}
      </div>
    </div>
  );
}

/* =====================
   App principal
   ===================== */
export default function App() {
  useEffect(() => { runTopNumbersTests(); runConsultadorTests(); runSubsetTests(); }, []);

  const { raw, analytic, fetchAll, loading, error, lastContest, lastDate, freq, totalDraws, hasSubset,
    nextEstPrize, acumulado, nextDate, lastOfficialNumbers, lastPrizeBreakdown, lastOfficialContest } = useMegasenaData();

  const [topN, setTopN] = useState(6);

  const chartData = useMemo(() => {
    return Object.entries(freq).map(([n, c]) => ({ dezena: n, vezes: Number(c) }));
  }, [freq]);

  const sim = useSimulator();

  const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

  // Tabela oficial fixa (6..20)
  const officialTable = [
    { n: 6,  price: 6.00,    odds: 50063860 },
    { n: 7,  price: 35.00,   odds: 7151980 },
    { n: 8,  price: 140.00,  odds: 1787995 },
    { n: 9,  price: 420.00,  odds: 595998 },
    { n: 10, price: 1050.00, odds: 238399 },
    { n: 11, price: 2310.00, odds: 108363 },
    { n: 12, price: 4620.00, odds: 54182 },
    { n: 13, price: 8580.00, odds: 29175 },
    { n: 14, price: 15015.00, odds: 16671 },
    { n: 15, price: 25025.00, odds: 10003 },
    { n: 16, price: 40040.00, odds: 6252 },
    { n: 17, price: 61880.00, odds: 4045 },
    { n: 18, price: 92820.00, odds: 2697 },
    { n: 19, price: 135660.00, odds: 1845 },
    { n: 20, price: 193800.00, odds: 1292 },
  ];

  return (
    <div className="min-h-screen bg-[#0b1020] text-[#e8eefc]">
      <div className="max-w-6xl mx-auto space-y-6">
      <header className="bg-[#111830] py-5 text-center shadow-md border-b border-[#1a2448]">
        <h1 className="text-3xl font-extrabold flex justify-center items-center gap-2 text-white">
          <BarChart3 className="w-7 h-7 text-[#67d38a]" />
          Mega-Sena • Painel Completo
        </h1>
        <p className="text-[#b6c2e6] text-sm">
          Resultados oficiais, simulação e estatísticas em tempo real.
          <Card className="mt-6">
  <CardContent className="text-sm text-white-700 leading-relaxed">
    <p>
      Este site é um simulador da Mega-Sena desenvolvido para fins informativos e educacionais.
      Os resultados e estatísticas aqui exibidos são baseados em dados públicos de sorteios
      oficiais, mas não possuem vínculo com a Caixa Econômica Federal.
    </p>
    <p className="mt-2">
      Use o simulador para explorar probabilidades, histórico de dezenas e frequência de números.
      Nenhum jogo é realizado neste site — ele serve apenas para análise e diversão.
    </p>
  </CardContent>
</Card>

        </p>
      </header>


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
        {/* Resultados oficiais */}
        

            {error && <div className="p-3 rounded-lg bg-red-50/10 border border-red-400/40 text-sm text-red-200">Erro: {error}</div>}

            {/* Top N + gráfico */}
            {totalDraws > 0 && (
              
              <>
              <Card className="border border-white/10 rounded-2xl overflow-hidden bg-[#111830] text-white shadow-xl">
          <CardContent className="p-4 md:p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-[#7aa7ff]" />
                            <h2 className="text-xl font-bold text-white">
                      Estatísticas de Sorteios
                    </h2>
              
                  </div>    
                  <p className="text-sm text-[#b6c2e6]">
                    Veja quais números mais saíram na história e suas combinações mais frequentes.
                  </p> 
                  </div>
                <div className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 text-sm font-semibold">Top numeros mais sorteados (histórico oficial)</div>
                    <label className="inline-flex items-center gap-2 text-xs">
                      <span className="text-[#b6c2e6]">Top N</span>
                      <Input type="number" min={1} max={60} value={topN} onChange={(e) => setTopN(Math.min(60, Math.max(1, Number(e.target.value) || 6)))} className="w-20 bg-[#0c1330] text-white border-white/20"/>
                    </label>
                  </div>
                  <TopNumbers freq={freq} topN={topN} />
                </div>

                <div className="h-80 bg-[#0e1530] border border-white/10 rounded-xl p-2 mt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <XAxis dataKey="dezena" tick={{ fontSize: 10, fill: "#b6c2e6" }} interval={0}/>
                      <YAxis allowDecimals={false} tick={{ fill: "#b6c2e6" }} />
                      <Tooltip formatter={(v) => [v, "vezes"]} contentStyle={{ background: "#0e1530", border: "1px solid rgba(255,255,255,.12)", color: "#e8eefc" }}/>
                      <Bar dataKey="vezes" fill="#7aa7ff" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ✅ Combinações entre os Top N (inclui "Top combinações k=2") */}
                <TopCombosFromTopN
                  raw={raw}
                  freq={freq}
                  totalDraws={totalDraws}
                  topN={topN}
                />

                {/* Consultador (opcional – já estava no código) */}
                <Consultador raw={raw} analytic={analytic} hasSubset={hasSubset} />
                {/* Rodapé */}
             {/* Rodapé */}
             <div className="text-xs text-[#b6c2e6]">Fontes: GitHub comunitário (histórico completo) + API alternativa (dados recentes). Em caso de indisponibilidade da API, o app utiliza somente o histórico.</div>
          </CardContent>
        </Card>
              </>
            )}

            

        {/* Simulador 6×60 */}
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
              <Button onClick={sim.start} disabled={sim.running} className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#67d38a] to-[#42d0a0]">
                <Play className="w-4 h-4 mr-1" /> Iniciar
              </Button>
              <Button onClick={sim.stop} disabled={!sim.running} className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#ff6b6b] to-[#ff8b6b]">
                <Square className="w-4 h-4 mr-1" /> Parar
              </Button>
              <Button onClick={sim.reset} className="font-extrabold text-[#0b1020] bg-gradient-to-r from-[#9aa7ff] to-[#7aa7ff]">
                <RotateCcw className="w-4 h-4 mr-1" /> Reset
              </Button>
                  </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm bg-[#0c1330] border border-white/10 rounded-full px-3 py-2">
                <span className="text-[#b6c2e6]">Iterações por tick</span>
                <Input type="number" className="w-28 bg-[#0c1330] text-white border-white/20" min={1} max={50000} step={100} value={sim.batch} onChange={(e) => sim.setBatch(Math.max(1, Math.min(50000, Number(e.target.value) || 1)))}/>
              </label>
              <label className="inline-flex items-center gap-2 text-sm bg-[#0c1330] border border-white/10 rounded-full px-3 py-2">
                <span className="text-[#b6c2e6]">Intervalo ms</span>
                <Input type="number" className="w-28 bg-[#0c1330] text-white border-white/20" min={1} max={10000} step={10} value={sim.intervalMs} onChange={(e) => sim.setIntervalMs(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}/>
              </label>
              <label className="inline-flex items-center gap-2 text-sm bg-[#0c1330] border border-white/10 rounded-full px-3 py-2">
                <input type="checkbox" className="accent-[#67d38a]" checked={sim.limitEnabled} onChange={(e) => sim.setLimitEnabled(e.target.checked)} />
                <span className="text-[#b6c2e6]">Limitar sorteios</span>
                <Input type="number" className="w-36 bg-[#0c1330] text-white border-white/20" min={1} max={100000000} step={1} disabled={!sim.limitEnabled} value={sim.limitTotal} onChange={(e) => sim.setLimitTotal(Math.max(1, Math.min(100000000, Number(e.target.value) || 1)))}/>
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="bg-[#0c1330] border border-white/10 rounded-xl p-3">
                <div className="text-xs text-[#b6c2e6]">Total de sorteios</div>
                <div className="text-2xl font-black">{sim.total.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-[#0c1330] border border-white/10 rounded-xl p-3">
                <div className="text-xs text-[#b6c2e6]">Aparições acumuladas (deve ser 6×total)</div>
                <div className="text-2xl font-black">{sim.sum.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-[#0c1330] border border-white/10 rounded-xl p-3">
                <div className="text-xs text-[#b6c2e6]">Progresso do limite</div>
                <div className="text-2xl font-black">
                  {sim.limitEnabled ? `${Math.min(sim.total, sim.limitTotal).toLocaleString("pt-BR")} / ${sim.limitTotal.toLocaleString("pt-BR")}` : "—"}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#b6c2e6] mb-2">Top 6 números mais sorteados (simulador)</div>
              <div className="flex flex-wrap gap-2">
                {sim.top6.map((o) => (
                  <div key={o.n} title={`${o.v} vezes`} className="w-10 h-10 rounded-full grid place-items-center font-bold text-gray-900" style={{ background: "radial-gradient(circle at 30% 30%, #fff, #e3ecff 60%, #d6e0ff 100%)", boxShadow: "inset 0 -3px 8px rgba(0,0,0,.2)", border: "1px solid rgba(0,0,0,.15)"}}>
                    {String(o.n).padStart(2, "0")}
                  </div>
                ))}
              </div>
            </div>

       
             

            <div className="bg-[#0e1530] border border-white/10 rounded-xl p-3 max-h-[540px] overflow-auto">
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
                      <tr key={n} className="border-b border-dashed border-white/10">
                        <td className="text-left py-1.5 px-2">{String(n).padStart(2, "0")}</td>
                        <td className="text-right py-1.5 px-2">{v.toLocaleString("pt-BR")}</td>
                        <td className="text-right py-1.5 px-2">{pct.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-[#b6c2e6] flex justify-between flex-wrap gap-2">
              <span>Cada sorteio contém 6 números distintos entre 1 e 60.</span>
              <span>{sim.running ? "Rodando…" : "Parado"}</span>
            </div>
          </CardContent>
        </Card>

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
                  <div>© 2025 V1.0.3 - Projeto criado por Lucas Bustamante.</div>
                  Projeto informativo sem vínculo com a Caixa Econômica Federal.

                </footer>
      </div>
    </div>
  );
}
