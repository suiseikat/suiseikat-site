"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Gauge, MousePointer2, RotateCcw, Sparkles, Trophy, Zap } from "lucide-react";

type Game = "reaction" | "cps" | "runner" | "2048";
type Rank = { username: string; avatarUrl: string | null; score: number };
const gameNames: Record<Game, string> = { reaction: "反应力", cps: "CPS", runner: "星空跑酷", "2048": "2048" };

function reactionRating(ms: number) {
  if (ms <= 160) return "你就是反应大王";
  if (ms <= 170) return "有点快了";
  if (ms <= 180) return "快去玩 CS";
  if (ms <= 190) return "有点小反应";
  if (ms <= 200) return "反应正常";
  return "再专注一点";
}

async function submit(game: Game, score: number, details = "") {
  return fetch("/api/games/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, score, details }) });
}

function Leaderboard({ game, ranks }: { game: Game; ranks: Rank[] }) {
  return <div className="test-leaderboard">
    <header><span><Trophy /> 全站排行</span><small>TOP 05</small></header>
    {ranks.length ? ranks.slice(0, 5).map((rank, index) => <div key={rank.username}>
      <b>{String(index + 1).padStart(2, "0")}</b><span>{rank.username}</span>
      <strong>{game === "reaction" ? `${rank.score}ms` : game === "cps" ? `${rank.score.toFixed(2)} CPS` : game === "runner" ? `${Math.round(rank.score)}m` : Math.round(rank.score)}</strong>
    </div>) : <p><Gauge /> 登录后完成挑战，就能把成绩留在这里。</p>}
  </div>;
}

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return <article className="test-metric"><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{note}</small></article>;
}

function ReactionGame({ done, ranks }: { done: () => void; ranks: Rank[] }) {
  const [phase, setPhase] = useState<"idle" | "wait" | "ready" | "result" | "done">("idle");
  const [times, setTimes] = useState<number[]>([]); const [last, setLast] = useState(0); const started = useRef(0); const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const begin = () => { setPhase("wait"); timer.current = window.setTimeout(() => { started.current = performance.now(); setPhase("ready"); }, 1100 + Math.random() * 2600); };
  const reset = () => { if (timer.current) clearTimeout(timer.current); setTimes([]); setLast(0); setPhase("idle"); };
  const hit = async () => {
    if (phase === "idle" || phase === "result") return begin();
    if (phase === "wait") { if (timer.current) clearTimeout(timer.current); setLast(-1); return setPhase("result"); }
    if (phase !== "ready") return;
    const ms = Math.round(performance.now() - started.current); const next = [...times, ms]; setTimes(next); setLast(ms);
    if (next.length === 5) { const average = Math.round(next.reduce((a, b) => a + b, 0) / 5); setPhase("done"); await submit("reaction", average, JSON.stringify(next)); done(); } else setPhase("result");
  };
  const average = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0; const best = times.length ? Math.min(...times) : 0;
  const title = phase === "idle" ? "反应力测试" : phase === "wait" ? "保持专注…" : phase === "ready" ? "现在！" : phase === "done" ? `${average} ms` : last < 0 ? "抢跑了" : `${last} ms`;
  return <div className="test-dashboard">
    <section className={`test-action-panel reaction-panel phase-${phase}`} onPointerDown={hit}>
      <button className="test-reset" type="button" onPointerDown={(event) => { event.stopPropagation(); reset(); }} aria-label="重新开始"><RotateCcw /></button>
      <div className="test-mode-tabs"><span className="is-active"><Zap /> 标准单次</span><span>连续五次</span><span>随机延迟</span></div>
      <div className="reaction-sakura">✦</div><h3>{title}</h3><p>{phase === "done" ? reactionRating(average) : phase === "result" ? "点击继续下一次" : "按下任意区域开始"}</p><small>COMET REACTION · {times.length} / 5</small>
    </section>
    <aside className="test-side">
      <div className="test-metrics"><Metric label="最佳记录" value={best ? `${best}ms` : "--"} note="当前这一组" icon={<ArrowRight />} /><Metric label="平均速度" value={average ? `${average}ms` : "--"} note="五次取平均" icon={<Gauge />} /><Metric label="总局数" value={String(times.length)} note="本轮挑战" icon={<Sparkles />} /></div>
      <div className="test-analysis"><header><span><Zap /> 最佳评级</span><b>{average ? reactionRating(average) : "等待测试"}</b></header><div className="analysis-grid"><article><small>发挥稳定度</small><strong>{times.length > 1 ? `${Math.max(0, 100 - Math.round(Math.max(...times) - Math.min(...times)))} / 100` : "--"}</strong><i><span style={{ width: times.length > 1 ? `${Math.max(8, 100 - (Math.max(...times) - Math.min(...times)))}%` : "0%" }} /></i></article><Leaderboard game="reaction" ranks={ranks} /></div><footer><span>最近 5 次记录</span><div>{[0, 1, 2, 3, 4].map((index) => <b key={index}>{times[index] ? `${times[index]}` : "—"}</b>)}</div></footer></div>
    </aside>
  </div>;
}

function CpsGame({ done, ranks }: { done: () => void; ranks: Rank[] }) {
  const [duration, setDuration] = useState(5); const [running, setRunning] = useState(false); const [count, setCount] = useState(0); const [left, setLeft] = useState(5); const [history, setHistory] = useState<number[]>([]); const countRef = useRef(0); const end = useRef(0);
  useEffect(() => { if (!running) return; const id = window.setInterval(() => { const remain = Math.max(0, (end.current - performance.now()) / 1000); setLeft(remain); if (remain <= 0) { window.clearInterval(id); setRunning(false); const cps = countRef.current / duration; setHistory((value) => [cps, ...value].slice(0, 5)); if (duration === 5) void submit("cps", cps, String(countRef.current)).then(done); } }, 32); return () => window.clearInterval(id); }, [running, duration, done]);
  const click = () => { if (!running) { countRef.current = 1; setCount(1); setLeft(duration); end.current = performance.now() + duration * 1000; setRunning(true); } else { countRef.current += 1; setCount(countRef.current); } };
  const current = running ? count / Math.max(.1, duration - left) : history[0] ?? 0; const best = history.length ? Math.max(...history) : 0;
  return <div className="test-dashboard">
    <section className="test-action-panel cps-panel" onPointerDown={click}><div className="duration-select">{[1, 5, 10].map((seconds) => <button key={seconds} className={duration === seconds ? "is-active" : ""} onPointerDown={(event) => { event.stopPropagation(); if (!running) setDuration(seconds); }}>{seconds}秒</button>)}</div><div className="cps-icon"><MousePointer2 /></div><h3>{running ? count : history.length ? `${history[0].toFixed(2)} CPS` : "CPS 点击速度测试"}</h3><p>{running ? `还剩 ${left.toFixed(1)} 秒` : "点击这个区域开始，再尽可能快地连续点击"}</p><small>COMET CLICK LAB</small></section>
    <aside className="test-side"><div className="test-metrics"><Metric label="最高 CPS" value={best ? best.toFixed(2) : "--"} note="本次访问" icon={<ArrowRight />} /><Metric label="当前 CPS" value={current ? current.toFixed(2) : "--"} note={running ? "实时计算" : "等待中"} icon={<Zap />} /><Metric label="点击次数" value={String(count)} note={`${duration}秒模式`} icon={<MousePointer2 />} /></div><div className="test-analysis"><header><span><Zap /> 点击评级</span><b>{best >= 10 ? "闪电手速" : best ? "继续加速" : "新手起步"}</b></header><div className="analysis-grid"><article><small>手感状态</small><strong>{running ? "火热" : "校准中"}</strong><i><span style={{ width: `${Math.min(100, current * 8)}%` }} /></i></article><Leaderboard game="cps" ranks={ranks} /></div><footer><span>最近记录</span><div>{[0, 1, 2, 3, 4].map((index) => <b key={index}>{history[index] ? history[index].toFixed(2) : "—"}</b>)}</div></footer></div></aside>
  </div>;
}

function RunnerGame({ done, ranks }: { done: () => void; ranks: Rank[] }) {
  const canvas = useRef<HTMLCanvasElement>(null); const sprite = useRef<HTMLImageElement | null>(null); const frame = useRef(0); const loopRef = useRef<(now: number) => void>(() => undefined); const lastFrame = useRef(0); const state = useRef({ running: false, y: 0, velocity: 0, obstacleX: 820, obstacleW: 30, obstacleH: 46, distance: 0 }); const [distance, setDistance] = useState(0); const [running, setRunning] = useState(false); const [best, setBest] = useState(0);
  useEffect(() => { const image = new Image(); image.src = "/suisei-runner.png"; sprite.current = image; return () => cancelAnimationFrame(frame.current); }, []);
  const loop = useCallback((now: number) => {
    const canvasNode = canvas.current, image = sprite.current, value = state.current; if (!canvasNode || !image || !value.running) return;
    const width = canvasNode.clientWidth || 760, height = canvasNode.clientHeight || 390, dpr = Math.min(2, window.devicePixelRatio || 1); if (canvasNode.width !== Math.round(width * dpr) || canvasNode.height !== Math.round(height * dpr)) { canvasNode.width = Math.round(width * dpr); canvasNode.height = Math.round(height * dpr); }
    const context = canvasNode.getContext("2d")!; context.setTransform(dpr, 0, 0, dpr, 0, 0); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    const dt = Math.min(34, Math.max(8, now - (lastFrame.current || now))); lastFrame.current = now; const speed = Math.min(15.5, 4.5 + value.distance / 220); value.distance += speed * dt / 240; value.velocity += .00225 * dt; value.y = Math.min(0, value.y + value.velocity * dt); value.obstacleX -= speed * dt / 13.5;
    if (value.obstacleX < -value.obstacleW) { value.obstacleX = width + 240 + Math.random() * Math.max(160, 380 - value.distance / 2); value.obstacleW = 25 + Math.random() * Math.min(30, 8 + value.distance / 100); value.obstacleH = 38 + Math.random() * Math.min(45, 10 + value.distance / 80); }
    const meters = Math.floor(value.distance); setDistance(meters); context.clearRect(0, 0, width, height); const gradient = context.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, "#11152b"); gradient.addColorStop(1, "#24182c"); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(255,255,255,.25)"; for (let index = 0; index < 28; index++) { const point = (index * 109 - value.distance * (index % 3 + 1)) % (width + 30); const x = point < 0 ? point + width : point; context.fillRect(x, 25 + (index * 47) % Math.max(80, height - 120), index % 4 === 0 ? 2 : 1, index % 4 === 0 ? 2 : 1); }
    const floor = height - 58; context.strokeStyle = "rgba(215,88,139,.65)"; context.beginPath(); context.moveTo(0, floor); context.lineTo(width, floor); context.stroke(); const spriteSize = Math.min(142, Math.max(104, width * .16)), spriteX = Math.min(72, width * .09), spriteY = floor - spriteSize + value.y; context.drawImage(image, spriteX, spriteY, spriteSize * 1.18, spriteSize);
    context.fillStyle = "#d7588b"; context.fillRect(value.obstacleX, floor - value.obstacleH, value.obstacleW, value.obstacleH); context.fillStyle = "rgba(255,255,255,.35)"; context.fillRect(value.obstacleX + 5, floor - value.obstacleH + 6, 2, Math.max(5, value.obstacleH - 12));
    const collided = value.obstacleX < spriteX + spriteSize * .88 && value.obstacleX + value.obstacleW > spriteX + spriteSize * .28 && floor - value.obstacleH < floor + value.y - 4 && floor > spriteY + spriteSize * .25;
    if (collided) { value.running = false; setRunning(false); setBest((current) => Math.max(current, meters)); void submit("runner", meters).then(done); return; } frame.current = requestAnimationFrame(loopRef.current);
  }, [done]);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  const action = useCallback(() => { const value = state.current; if (!value.running) { value.running = true; value.y = 0; value.velocity = 0; value.obstacleX = (canvas.current?.clientWidth || 760) + 260; value.distance = 0; lastFrame.current = performance.now(); setDistance(0); setRunning(true); frame.current = requestAnimationFrame(loopRef.current); } else if (value.y === 0) value.velocity = -1.05; }, []);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.code === "Space") { event.preventDefault(); action(); } }; addEventListener("keydown", handler); return () => removeEventListener("keydown", handler); }, [action]);
  return <div className="runner-dashboard"><section className="runner-stage" onPointerDown={action}><canvas ref={canvas} /><div className="runner-hud"><small>DISTANCE</small><strong>{distance} m</strong><span>{running ? "点击 / 空格跳跃" : "点击开始跑酷"}</span></div><div className="runner-speed">难度 {Math.min(10, 1 + Math.floor(distance / 180))} / 10</div></section><aside className="runner-aside"><Metric label="本次距离" value={`${distance}m`} note="实时记录" icon={<Gauge />} /><Metric label="本地最佳" value={`${best}m`} note="当前访问" icon={<Sparkles />} /><Leaderboard game="runner" ranks={ranks} /></aside></div>;
}

const empty = () => Array<number>(16).fill(0);
function addTile(board: number[]) { const spaces = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0); if (!spaces.length) return board; const output = [...board]; output[spaces[Math.floor(Math.random() * spaces.length)]] = Math.random() < .9 ? 2 : 4; return output; }

function Twenty48({ done, ranks }: { done: () => void; ranks: Rank[] }) {
  const [board, setBoard] = useState(() => addTile(addTile(empty()))); const [score, setScore] = useState(0);
  const move = useCallback((key: string) => { const vertical = key === "ArrowUp" || key === "ArrowDown", reverse = key === "ArrowRight" || key === "ArrowDown"; if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return; let gained = 0; const output = empty(); for (let line = 0; line < 4; line++) { const values: number[] = []; for (let step = 0; step < 4; step++) { const point = reverse ? 3 - step : step, index = vertical ? point * 4 + line : line * 4 + point; if (board[index]) values.push(board[index]); } for (let index = 0; index < values.length - 1; index++) if (values[index] === values[index + 1]) { values[index] *= 2; gained += values[index]; values.splice(index + 1, 1); } for (let step = 0; step < values.length; step++) { const point = reverse ? 3 - step : step; output[vertical ? point * 4 + line : line * 4 + point] = values[step]; } } if (output.some((value, index) => value !== board[index])) { const next = addTile(output); setBoard(next); setScore((value) => value + gained); if (Math.max(...next) >= 2048) void submit("2048", Math.max(score + gained, 2048)).then(done); } }, [board, score, done]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key.startsWith("Arrow")) { event.preventDefault(); move(event.key); } }; addEventListener("keydown", handler); return () => removeEventListener("keydown", handler); }, [move]);
  const reset = () => { setBoard(addTile(addTile(empty()))); setScore(0); }; const controls = [{ key: "ArrowUp", icon: <ArrowUp />, label: "上" }, { key: "ArrowLeft", icon: <ArrowLeft />, label: "左" }, { key: "ArrowDown", icon: <ArrowDown />, label: "下" }, { key: "ArrowRight", icon: <ArrowRight />, label: "右" }];
  return <div className="game-2048-layout"><section className="game-2048"><header><div><small>SCORE</small><strong>{score}</strong></div><button onClick={reset}><RotateCcw /> RESET</button></header><div className="game-2048-stage"><div className="grid-2048">{board.map((value, index) => <div key={index} data-value={value}>{value || ""}</div>)}</div><div className="direction-pad">{controls.map((control) => <button key={control.key} className={control.key.replace("Arrow", "dir-").toLowerCase()} onClick={() => move(control.key)} aria-label={control.label}>{control.icon}</button>)}</div></div><p>电脑可用方向键；手机和平板请使用右侧方向按钮。</p><button className="score-submit" onClick={() => void submit("2048", score).then(done)}>保存当前成绩</button></section><aside className="runner-aside"><Metric label="当前积分" value={String(score)} note="合并所得" icon={<Gauge />} /><Metric label="最大方块" value={String(Math.max(...board))} note="当前棋盘" icon={<Sparkles />} /><Leaderboard game="2048" ranks={ranks} /></aside></div>;
}

export function FunZone() {
  const [game, setGame] = useState<Game>("reaction"), [ranks, setRanks] = useState<Rank[]>([]); const load = useCallback(() => fetch(`/api/games/scores?game=${game}`, { cache: "no-store" }).then((response) => response.json() as Promise<{ leaderboard?: Rank[] }>).then((data) => setRanks(data.leaderboard ?? [])), [game]); useEffect(() => { void load(); }, [load]);
  const content = useMemo(() => game === "reaction" ? <ReactionGame done={load} ranks={ranks} /> : game === "cps" ? <CpsGame done={load} ranks={ranks} /> : game === "runner" ? <RunnerGame done={load} ranks={ranks} /> : <Twenty48 done={load} ranks={ranks} />, [game, ranks, load]);
  return <div className="fun-zone"><nav>{(Object.keys(gameNames) as Game[]).map((item) => <button className={game === item ? "is-active" : ""} onClick={() => setGame(item)} key={item}>{gameNames[item]}</button>)}</nav><div className="fun-content">{content}</div></div>;
}
