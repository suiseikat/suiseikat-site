export const siteConfig = {
  // 修改为网站真正上线的时间，运行时长会从这个时间开始计算。
  launchDate: "2026-09-15T00:00:00+08:00",
  features: [
    { title: "留言板", description: "留下一句话，也看看路过这里的人正在想些什么。", status: "进入留言板", href: "/messages" },
    { title: "作品", description: "陈列完成的项目，也保留那些还在生长的实验。", status: "进入作品", href: "/works" },
    { title: "实验室", description: "浏览器工具、网址入口和正在整理的课程导航。", status: "进入实验室", href: "/lab" },
    { title: "关于我", description: "关于 Suieikat，以及这个小站为什么会存在。", status: "进入个人主页", href: "/u/suiseikat" },
  ],
} as const;
