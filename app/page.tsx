"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Box, Clock3, Code2, MessageCircleHeart, UserRound } from "lucide-react";
import { MessagePreview } from "@/components/message-preview";
import { DailyMusic } from "@/components/daily-music";
import { SiteMotion } from "@/components/site-motion";
import { DailyFortune } from "@/components/daily-fortune";
import { GlassLens } from "@/components/liquid-glass";
import { siteConfig } from "@/lib/site-config";

type Uptime = { days: number; hours: number; minutes: number; seconds: number };
const featureIcons = [MessageCircleHeart, Box, Code2, UserRound];
const featureEnglish = ["GUESTBOOK", "WORKS", "LABORATORY", "PROFILE"];

function splitDuration(totalSeconds: number): Uptime {
  return { days: Math.floor(totalSeconds / 86400), hours: Math.floor((totalSeconds % 86400) / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: Math.floor(totalSeconds % 60) };
}

export default function Home() {
  const [uptime, setUptime] = useState<Uptime>(() => splitDuration(0));
  const [launchTime, setLaunchTime] = useState(() => Date.parse(siteConfig.launchDate));
  const [visitors, setVisitors] = useState(0);

  useEffect(() => {
    fetch("/api/status").then(async (response) => (await response.json()) as { launchTime?: string; visitors?: number }).then((data) => {
      const timestamp = data.launchTime ? Date.parse(data.launchTime) : NaN;
      if (!Number.isNaN(timestamp)) setLaunchTime(timestamp);
      setVisitors(data.visitors ?? 0);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const update = () => setUptime(splitDuration(Math.max(0, (Date.now() - launchTime) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [launchTime]);

  return (
    <main className="site-shell">
      <SiteMotion />
      <div className="fixed-site-background" aria-hidden="true" />
      <div className="page-grid" aria-hidden="true" />

      <section id="top" className="hero">
        <div className="hero-art" aria-hidden="true" data-hero-reveal>
          <img className="orbit-logo" src="/orbit-logo.webp" alt="" />
          <i className="hero-shape hero-shape-a" /><i className="hero-shape hero-shape-b" /><i className="hero-shape hero-shape-c" /><i className="hero-shape hero-shape-d" />
          <div className="hero-crosshair" /><div className="hero-art-note">STELLAR<br />2026-9-16</div>
        </div>
        <div className="hero-copy" data-hero-reveal>
          <div className="eyebrow">PERSONAL SPACE <span>HK / 22.3°N</span></div>
          <h1 aria-label="COMET SHINING"><span className="hero-title-mask"><span>COMET</span></span><span className="hero-title-mask"><em>SHINING</em></span></h1>
          <p>收集想法、作品与正在发生的事。<br />这里会慢慢长成我喜欢的样子。</p>
          <a className="explore-link" href="#spaces">EXPLORE <ArrowDown size={15} /></a>
          <div className="hero-coordinate"><i /> OPEN ORBIT / EST. 2026 <span>一直好奇，一直闪耀。</span></div>
        </div>
        <div className="hero-footnote" data-hero-reveal><span>A SMALL PLACE ON THE WEB</span><a href="#spaces">向下探索 <ArrowDown size={14}/></a><span>01 / INTRODUCTION</span></div>
      </section>

      <section className="marquee-divider" aria-label="Designing, creating, discovering, exploring">
        <div className="marquee-row"><div className="marquee-track"><span>DESIGNING // CREATING // DISCOVERING // EXPLORING //</span><span>DESIGNING // CREATING // DISCOVERING // EXPLORING //</span></div></div>
      </section>

      <section id="spaces" className="spaces-section space-active-none" aria-labelledby="spaces-title" data-reveal>
        <div className="section-heading"><div><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span>02 / EXPLORE</span><h2 id="spaces-title">一些空间</h2></div><DailyFortune /></div>
        <div className="feature-grid">
          {siteConfig.features.map((feature, index) => {
            const Icon = featureIcons[index] ?? Box;
            const image = ["/space-messages-v2.jpg", "/space-works.webp", "/space-lab.webp", "/site-background-v2.webp"][index] ?? "/site-background-v2.webp";
            return <Link className={`feature-card accent-${index + 1}`} href={feature.href} key={feature.title} data-reveal-card>
              <img className="feature-scene" src={image} alt="" aria-hidden="true" />
              <GlassLens source={image} local />
              <div className="card-top"><span className="feature-icon"><Icon size={21} strokeWidth={1.45} /></span><span className="card-index">0{index + 1}</span><ArrowUpRight className="arrow" size={20} /></div>
              <div className="card-copy"><div className="feature-title-line"><h3>{feature.title}</h3><small>{featureEnglish[index]}</small></div>{index === 0 ? <MessagePreview /> : <p>{feature.description}</p>}</div>
              <span className="coming-soon">{feature.status}</span>
            </Link>;
          })}
        </div>
      </section>

      <DailyMusic />

      <footer className="compact-footer">
        <div className="compact-status"><div><img className="section-signature" src="/suieikat-signature.webp" alt="" /><span>04 / STATUS</span></div><p><Clock3 size={11} /> {uptime.days}D {String(uptime.hours).padStart(2, "0")}H {String(uptime.minutes).padStart(2, "0")}M {String(uptime.seconds).padStart(2, "0")}S · {visitors.toLocaleString()} VISITORS</p></div>
        <p className="copyright">© {new Date().getFullYear()} SUIEIKAT<br />MADE WITH CURIOSITY.</p>
      </footer>

    </main>
  );
}
