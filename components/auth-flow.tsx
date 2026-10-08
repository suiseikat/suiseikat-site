"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { notify } from "@/lib/notifications";
import { leaveBorderGlow, moveBorderGlow } from "@/components/border-glow";
import type { Viewer } from "@/lib/community-types";

type Mode = "login" | "register" | "reset";
/** Stepper: validation gates each step; only the API can finish the last one. */
export function AuthFlow({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fields, setFields] = useState({ username: "", identity: "", email: "", password: "", confirmPassword: "" });
  const heading = useRef<HTMLHeadingElement>(null);
  const register = mode === "register", reset = mode === "reset";
  const labels = register ? ["认识你", "联系方式", "设置密码"] : reset ? ["注册邮箱", "新密码"] : ["你的账号", "输入密码"];
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  const set = (name: keyof typeof fields, value: string) => { setFields(old => ({ ...old, [name]: value })); setError(""); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setError("");
    if (register && step === 0 && !/^[\p{L}\p{N}_-]{2,24}$/u.test(fields.username.normalize("NFKC").trim())) { setError("用户名需为 2—24 个文字、数字、下划线或连字符。"); return; }
    if (step < labels.length - 1) { setStep(step + 1); return; }
    if ((register || reset) && fields.password !== fields.confirmPassword) { setError("两次输入的密码不一致。"); notify("两次输入的密码不一致。", "error"); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${reset ? "reset-password" : mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
      const data = await response.json() as { user?: Viewer; error?: string };
      if (!response.ok) throw new Error(data.error ?? "暂时无法完成操作，请重试。");
      if (reset) { notify("密码已重置，请使用新密码登录。", "success"); router.replace("/login"); }
      else {
        if (!data.user) throw new Error("未能获取账号信息，请重新登录。");
        setFields({ username: "", identity: "", email: "", password: "", confirmPassword: "" });
        window.dispatchEvent(new Event("comet:auth-change"));
        notify(register ? "注册成功，欢迎来到你的个人空间。" : "登录成功，欢迎回来。", "success");
        router.replace(`/u/${encodeURIComponent(data.user.username)}`);
      }
    } catch (e) { const message = e instanceof Error ? e.message : "网络异常，请重试。"; setError(message); notify(message, "error"); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-backdrop" aria-hidden="true"/><section className="auth-story"><small>COMET SHINING / MEMBER ACCESS</small><h1>{register ? <>A new<br/><em>orbit.</em></> : reset ? <>Find your<br/><em>way back.</em></> : <>Welcome<br/><em>home.</em></>}</h1><p>{register ? "从一个名字开始，记录属于你的星迹。" : reset ? "使用注册时的邮箱找回你的账号。" : "回到你的空间，继续尚未写完的故事。"}</p><Link href="/">探索小站 <ArrowRight size={16}/></Link></section>
    <section className="auth-card" aria-label={register ? "注册" : reset ? "重置密码" : "登录"} aria-busy={busy}>
      <div className="auth-card-top"><span>{register ? "JOIN THE ORBIT" : reset ? "RECOVER ACCOUNT" : "MEMBER LOGIN"}</span><small>0{step + 1} / 0{labels.length}</small></div>
      <ol className="auth-stepper">{labels.map((label, index) => <li key={label} data-state={index < step ? "complete" : index === step ? "active" : "next"}><button type="button" disabled={busy || index >= step} onClick={() => { setStep(index); setError(""); }} aria-current={index === step ? "step" : undefined} aria-label={`${index + 1}. ${label}`}><span>{index < step ? <Check size={15}/> : index + 1}</span><small>{label}</small></button>{index < labels.length - 1 && <i/>}</li>)}</ol>
      <form onSubmit={submit}><div key={step} className="auth-step-content"><h2 ref={heading} tabIndex={-1}>{labels[step]}</h2><p>{step === 0 ? register ? "这是你的登录用户名，以后可以另外设置昵称。" : reset ? "填写当时保存在账号中的邮箱。" : "填写用户名或邮箱，登录状态会在当前设备保留。" : register && step === 1 ? "用于找回密码，请务必填写自己的邮箱。" : "请输入 8—128 位密码。"}</p>
        {step === 0 && !reset && <label>{register ? "用户名" : "用户名 / 邮箱"}<input name={register ? "username" : "identity"} autoComplete="username" required minLength={register ? 2 : 1} maxLength={register ? 24 : 120} value={register ? fields.username : fields.identity} onChange={e => set(register ? "username" : "identity", e.target.value)} /></label>}
        {((register && step === 1) || (reset && step === 0)) && <label>邮箱<input type="email" name="email" autoComplete="email" required maxLength={120} value={fields.email} onChange={e => set("email", e.target.value)}/></label>}
        {step === labels.length - 1 && <><label>{reset ? "新密码" : "密码"}<input type="password" name="password" autoComplete={register || reset ? "new-password" : "current-password"} required minLength={8} maxLength={128} value={fields.password} onChange={e => set("password", e.target.value)}/></label>{(register || reset) && <label>再确认一次<input type="password" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={128} value={fields.confirmPassword} onChange={e => set("confirmPassword", e.target.value)}/></label>}{!register && !reset && <Link className="auth-forgot" href="/reset-password">忘记密码？</Link>}</>}
      </div>{error && <p className="auth-error" role="alert">{error}</p>}<div className="auth-step-actions">{step > 0 && <button type="button" disabled={busy} onClick={() => { setStep(step - 1); setError(""); }}><ArrowLeft size={16}/> 上一步</button>}<button className="auth-next border-glow-action" onPointerMove={moveBorderGlow} onPointerLeave={leaveBorderGlow} disabled={busy} type="submit">{busy ? <><Loader2 className="is-spinning" size={16}/> 正在提交</> : <>{step === labels.length - 1 ? register ? "创建账号" : reset ? "重置密码" : "登录" : "继续"}<ArrowRight size={16}/></>}</button></div></form>
      <footer>{register ? <>已有账号？<Link href="/login">登录</Link></> : <>还没有账号？<Link href="/register">注册</Link></>}{reset && <Link href="/login">返回登录</Link>}</footer>
    </section></main>;
}
