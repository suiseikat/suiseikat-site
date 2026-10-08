"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
import { TiltedMusicCover } from "@/components/tilted-music-cover";
import { notify } from "@/lib/notifications";

type Track = {
  id: number; name: string; artists: string; album: string; coverUrl: string;
  durationMs: number; songUrl: string; audioUrl: string; playlistName: string;
};

function time(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function DailyMusic() {
  const [track, setTrack] = useState<Track | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resolvedAudio = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (attempt = 0) => {
      try {
        const response = await fetch("/api/music/daily", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Music request failed");
        const data = await response.json() as { track: Track | null };
        if (!controller.signal.aborted) { setTrack(data.track); setLoadingError(false); }
      } catch {
        if (controller.signal.aborted) return;
        if (attempt < 2) timer = setTimeout(() => { void load(attempt + 1); }, 600 * (attempt + 1));
        else { setLoadingError(true); setTrack(null); }
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [loadAttempt]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !track || connecting) return;
    if (!audio.paused) { audio.pause(); return; }
    setConnecting(true);
    try {
      if (resolvedAudio.current !== track.id) {
        try {
          const response = await fetch(`/api/music/audio?id=${track.id}`, { cache: "no-store" });
          if (response.ok) {
            const data = await response.json() as { url: string };
            if (audioRef.current !== audio) return;
            audio.src = data.url;
            resolvedAudio.current = track.id;
          }
        } catch { /* Keep the public playback fallback available. */ }
      }
      if (audioRef.current === audio) await audio.play();
    } catch { resolvedAudio.current = null; notify("暂时无法播放，请稍后重试或前往网易云收听。", "error"); }
    finally { setConnecting(false); }
  };
  const seek = (value: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value;
    setCurrent(value);
  };
  const total = duration || ((track?.durationMs ?? 0) / 1000);
  const progress = total ? Math.min(100, current / total * 100) : 0;
  const progressStyle = { "--music-progress": `${progress}%` } as CSSProperties;
  const refreshTrack = async () => {
    setRefreshing(true); audioRef.current?.pause(); setCurrent(0); setDuration(0);
    try { const response = await fetch("/api/music/daily", { method: "POST" }); if (!response.ok) throw new Error(); const data = await response.json() as { track: Track | null }; resolvedAudio.current = null; setLoadingError(false); setTrack(data.track); }
    catch { notify("歌曲切换失败，请稍后重试。", "error"); }
    finally { setRefreshing(false); }
  };

  return <section id="about" className="manifesto music-manifesto" data-reveal>
    <div className="manifesto-dark music-information">
      <div><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span>03 / DAILY TRACK</span></div>
      <button className="music-refresh" type="button" onClick={loadingError ? () => { setTrack(undefined); setLoadingError(false); setLoadAttempt(value => value + 1); } : refreshTrack} disabled={refreshing || connecting} title={loadingError ? "重新加载" : "换一首歌"} aria-label={loadingError ? "重新加载音乐" : "从歌单换一首歌"}><RefreshCw className={refreshing ? "is-spinning" : ""} /></button>
      {track === undefined ? <div className="music-empty"><small>CONNECTING TO ORBIT</small><strong>LOADING<br />SIGNAL.</strong></div> : track ? <>
        <div className="music-copy"><small>TODAY&apos;S FREQUENCY</small><h2>{track.name}</h2><dl><div><dt>ARTIST</dt><dd>{track.artists}</dd></div><div><dt>ALBUM</dt><dd>{track.album}</dd></div><div><dt>TYPE / LENGTH</dt><dd>SONG · {time(total)}</dd></div></dl></div>
        <div className="music-player"><audio key={track.id} ref={audioRef} src={track.audioUrl} preload="none" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} /><button type="button" onClick={toggle} disabled={connecting} aria-label={connecting ? "正在连接音乐" : playing ? "暂停" : "播放"}>{playing ? <Pause /> : <Play />}</button><span>{time(current)}</span><div className="comet-progress" style={progressStyle}><input aria-label="播放进度" type="range" min="0" max={Math.max(1, total)} step="0.1" value={current} onChange={(event) => seek(Number(event.target.value))} /><i aria-hidden="true">☄</i></div><span>{time(total)}</span></div>
      </> : <div className="music-empty"><small>{loadingError ? "CONNECTION INTERRUPTED" : "NO PLAYLIST CONFIGURED"}</small><strong>WAITING<br />FOR MUSIC.</strong><p>{loadingError ? "音乐服务暂时无法连接，点击右上角重试即可，无需刷新页面。" : "管理员可在后台填入网易云歌单链接。"}</p></div>}
    </div>
    <div className="manifesto-light music-cover-stage">{track ? <TiltedMusicCover key={`${track.id}:${track.coverUrl}`} image={track.coverUrl} title={track.name} href={track.songUrl}/> : <div className="music-placeholder">♪</div>}</div>
  </section>;
}
