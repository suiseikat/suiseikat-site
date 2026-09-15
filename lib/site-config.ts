export const siteConfig = {
  // 修改为网站真正上线的时间，运行时长会从这个时间开始计算。
  launchDate: "2026-09-15T00:00:00+08:00",
  features: [
    { title: "随笔", description: "记录偶然出现的想法、片段和长期关注的问题。", status: "即将开放", href: "#" },
    { title: "作品", description: "陈列完成的项目，也保留那些还在生长的实验。", status: "即将开放", href: "#" },
    { title: "实验室", description: "一些代码、工具和没有明确用途的有趣尝试。", status: "即将开放", href: "#" },
    { title: "关于我", description: "关于 Suieikat，以及这个小站为什么会存在。", status: "即将开放", href: "#" },
  ],
} as const;
