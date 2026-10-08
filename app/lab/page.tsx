"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, ExternalLink, Search } from "lucide-react";
import { ImagePdfStudio } from "@/components/image-pdf-studio";
import { ImageToolbox } from "@/components/image-toolbox";
import { FunZone } from "@/components/fun-zone";

type Section="directory"|"images"|"pdf"|"courses"|"fun";
const menu:[Section,string,string][]=[["directory","01","网址聚合"],["images","02","图像工具"],["pdf","03","图片 PDF"],["courses","04","教学课程"],["fun","05","摸鱼一下"]];
const categories=["全部","学术搜索 · 查重","实用工具","学习 · 影视","社交 · 娱乐"] as const;
const sites=[
  ["Google Scholar","https://scholar.google.com/","学术搜索 · 查重","GS"],["中国知网","https://www.cnki.net/","学术搜索 · 查重","CN"],["求是学术搜索","https://zju.summon.serialssolutions.com/","学术搜索 · 查重","QS"],["万方数据","https://www.wanfangdata.com.cn/","学术搜索 · 查重","WF"],["Web of Science","https://www.webofscience.com/","学术搜索 · 查重","WS"],["Sci-Hub","https://sci-hub.ru/","学术搜索 · 查重","SH"],
  ["Google 翻译","https://translate.google.com/","实用工具","GT"],["文件空投","https://airportal.cn/","实用工具","AP"],["视频下载","https://snapany.com/zh/bilibili","实用工具","VD"],["GeoGebra","https://www.geogebra.org/","实用工具","GG"],
  ["哔哩哔哩","https://www.bilibili.com/","学习 · 影视","BI"],["虎牙直播","https://www.huya.com/","学习 · 影视","HY"],["E站动漫","https://www.ezdmw.org/","学习 · 影视","EZ"],["Akianime","https://www.akianime.cc/","学习 · 影视","AK"],["樱花动漫","https://yhdmoe.com/","学习 · 影视","YH"],["稀饭动漫","https://xifan.moe/","学习 · 影视","XF"],
  ["知乎","https://www.zhihu.com/hot","社交 · 娱乐","ZH"],["豆瓣","https://www.douban.com/","社交 · 娱乐","DB"],["微博热搜","https://s.weibo.com/top/summary","社交 · 娱乐","WB"],["虎扑","https://www.hupu.com/","社交 · 娱乐","HP"],["Pixiv","https://www.pixiv.net/","社交 · 娱乐","PX"],["JMComic","https://18comic.vip/","社交 · 娱乐","JM"],["绅士漫画","https://wnacg01.link/","社交 · 娱乐","WN"]
] as const;
const courses=[["Σ","高等数学","《高等数学》全程教学视频 2.0 版","宋浩老师","https://www.bilibili.com/video/BV1CAxaeHEeH/"],["∫","微积分","麻省理工微积分重点 · 全 18 讲","MIT Calculus","https://www.bilibili.com/video/BV1rY4y1P7er/"],["dx","微积分","微积分课程","浙江大学 · 苏德矿","https://www.bilibili.com/video/BV1Lt411r7NQ/"]] as const;

export default function LaboratoryPage(){const [section,setSection]=useState<Section>("directory"),[query,setQuery]=useState(""),[category,setCategory]=useState<(typeof categories)[number]>("全部");const filtered=useMemo(()=>sites.filter(site=>(category==="全部"||site[2]===category)&&`${site[0]} ${site[2]}`.toLowerCase().includes(query.toLowerCase())),[query,category]);return <main className="lab-shell"><div className="fixed-site-background"/><div className="page-grid"/>
  <header className="lab-header"><div className="lab-heading"><div><span>03 / EXPERIMENTAL INDEX</span><h1>LABORA<br/>TORY</h1></div><div className="lab-heading-mark"><i/><b>LAB<br/>/03</b></div></div></header>
  <div className="lab-layout"><aside className="lab-index lab-primary-menu"><span>PRIMARY INDEX</span>{menu.map(item=><button key={item[0]} className={section===item[0]?"is-active":""} onClick={()=>setSection(item[0])}><b>{item[1]}</b>{item[2]}</button>)}<p>选择一级菜单后，右侧只显示当前内容。</p></aside><div className="lab-content">
  {section==="directory"&&<section className="lab-section"><div className="lab-section-title"><span>01</span><div><small>CURATED / LINKS</small><h2>网址聚合</h2></div><p>分类、筛选，然后在新窗口打开。</p></div><label className="lab-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="SEARCH DIRECTORY"/></label><div className="directory-filters">{categories.map(item=><button key={item} className={category===item?"is-active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div><div className="directory-grid">{filtered.map(site=><a className="directory-card" href={site[1]} target="_blank" rel="noreferrer" key={site[0]}><span className="square-site-icon">{site[3]}</span><div><small>{site[2]}</small><h3>{site[0]}</h3><p>OPEN EXTERNAL RESOURCE</p></div><ArrowUpRight/></a>)}</div></section>}
  {section==="images"&&<section className="lab-section"><div className="lab-section-title"><span>02</span><div><small>IMAGE / LOCAL</small><h2>图像处理工具箱</h2></div><p>压缩、转换、九宫格与像素画，全部在浏览器本地处理。</p></div><ImageToolbox/></section>}
  {section==="pdf"&&<section className="lab-section lab-pdf"><div className="lab-section-title"><span>03</span><div><small>UTILITY / LOCAL</small><h2>图片合并 PDF</h2></div><p>排序、旋转并选择页面方向。</p></div><ImagePdfStudio/></section>}
  {section==="courses"&&<section className="lab-section"><div className="lab-section-title"><span>04</span><div><small>LEARNING / MATH</small><h2>教学课程</h2></div><p>高数与微积分课程导航。</p></div><div className="course-list">{courses.map((c,i)=><a className="course-card" href={c[4]} target="_blank" rel="noreferrer" key={c[4]}><span className="square-course-icon">{c[0]}</span><span className="course-number">0{i+1}</span><div><small>{c[1]}</small><h3>{c[2]}</h3><p>{c[3]}</p></div><ExternalLink/></a>)}</div></section>}
  {section==="fun"&&<section className="lab-section"><div className="lab-section-title"><span>05</span><div><small>BREAK / PLAY</small><h2>摸鱼实验场</h2></div><p>反应、手速、跑酷和合成。登录后成绩进入全站排行榜。</p></div><FunZone/></section>}
  </div></div></main>}
