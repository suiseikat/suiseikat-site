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
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch("/api/music/daily", { cache: "no-store" })
      .then(async (response) => (await response.json() as { track: Track | null }).track)
      .then(setTrack).catch(() => setTrack(null));
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => notify("暂时无法播放，请稍后重试或前往网易云收听。", "error")); else audio.pause();
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
    try { const response = await fetch("/api/music/daily", { method: "POST" }); if (!response.ok) throw new Error(); const data = await response.json() as { track: Track | null }; setTrack(data.track); }
    catch { notify("歌曲切换失败，请稍后重试。", "error"); }
    finally { setRefreshing(false); }
  };

  return <section id="about" className="manifesto music-manifesto" data-reveal>
    <div className="manifesto-dark music-information">
      <div><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span>03 / DAILY TRACK</span></div>
      <button className="music-refresh" type="button" onClick={refreshTrack} disabled={refreshing} title="换一首歌" aria-label="从歌单换一首歌"><RefreshCw className={refreshing ? "is-spinning" : ""} /></button>
      {track === undefined ? <div className="music-empty"><small>CONNECTING TO ORBIT</small><strong>LOADING<br />SIGNAL.</strong></div> : track ? <>
        <div className="music-copy"><small>TODAY&apos;S FREQUENCY</small><h2>{track.name}</h2><dl><div><dt>ARTIST</dt><dd>{track.artists}</dd></div><div><dt>ALBUM</dt><dd>{track.album}</dd></div><div><dt>TYPE / LENGTH</dt><dd>SONG · {time(total)}</dd></div></dl></div>
        <div className="music-player"><audio ref={audioRef} src={track.audioUrl} preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} /><button type="button" onClick={toggle} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause /> : <Play />}</button><span>{time(current)}</span><div className="comet-progress" style={progressStyle}><input aria-label="播放进度" type="range" min="0" max={Math.max(1, total)} step="0.1" value={current} onChange={(event) => seek(Number(event.target.value))} /><i aria-hidden="true">☄</i></div><span>{time(total)}</span></div>
      </> : <div className="music-empty"><small>NO PLAYLIST CONFIGURED</small><strong>WAITING<br />FOR MUSIC.</strong><p>管理员可在后台填入网易云歌单链接。</p></div>}
    </div>
    <div className="manifesto-light music-cover-stage">{track ? <TiltedMusicCover key={track.id} image={track.coverUrl} title={track.name} href={track.songUrl}/> : <div className="music-placeholder">♪</div>}</div>
  </section>;
}
