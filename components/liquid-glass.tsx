"use client";
import { useEffect, useRef } from "react";

/** Decorative optical layer. All interactive content remains accessible HTML. */
export function GlassLens({ source, local = false }: { source: string; local?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !window.matchMedia("(min-width: 821px) and (prefers-reduced-motion: no-preference)").matches) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(vertex, "attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}");
    gl.shaderSource(fragment, `precision mediump float;
      varying vec2 uv;uniform sampler2D photo;uniform vec2 size;uniform vec2 imageSize;uniform vec2 sceneSize;uniform vec2 sceneOffset;
      void main(){
        vec2 q=vec2(uv.x,1.-uv.y);
        float edge=min(min(q.x,1.-q.x),min(q.y,1.-q.y));
        float rim=1.-smoothstep(0.,.12,edge);
        vec2 bend=(q-.5)*rim*rim*.12;
        float a=sceneSize.x/sceneSize.y,b=imageSize.x/imageSize.y;
        vec2 fit=a>b?vec2(1.,b/a):vec2(a/b,1.);
        vec2 v=((sceneOffset+q*size+bend*size)/sceneSize-.5)*fit+.5;
        vec2 blur=vec2(.004);
        vec3 c=(texture2D(photo,v).rgb*2.+texture2D(photo,v+blur).rgb+texture2D(photo,v-blur).rgb+texture2D(photo,v+vec2(blur.x,-blur.y)).rgb+texture2D(photo,v+vec2(-blur.x,blur.y)).rgb)/6.;
        c.r=texture2D(photo,v+vec2(rim*.003,0.)).r;
        c.b=texture2D(photo,v-vec2(rim*.003,0.)).b;
        gl_FragColor=vec4(c+pow(rim,3.)*.22,.38+rim*.30);
      }`);
    gl.compileShader(vertex); gl.compileShader(fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    let alive = true, ready = false, visible = false;
    const image = new Image();
    const draw = () => {
      if (!alive || !ready || !visible || document.hidden || gl.isContextLost() || document.documentElement.dataset.glass === "frosted") return;
      const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio, 1.5);
      const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(gl.getUniformLocation(program, "size"), rect.width, rect.height);
      gl.uniform2f(gl.getUniformLocation(program, "imageSize"), image.naturalWidth, image.naturalHeight);
      const scene = local ? rect : source.includes("site-background") ? null : canvas.closest(".spaces-section")?.getBoundingClientRect();
      gl.uniform2f(gl.getUniformLocation(program, "sceneSize"), scene?.width ?? window.innerWidth, scene?.height ?? window.innerHeight);
      gl.uniform2f(gl.getUniformLocation(program, "sceneOffset"), rect.left - (scene?.left ?? 0), rect.top - (scene?.top ?? 0));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    image.onload = () => {
      if (!alive || gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      ready = true; draw();
    };
    image.src = source;
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) draw(); }, { rootMargin: "100px" });
    visibility.observe(canvas);
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    if (!local) window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("glass-style-change", onScroll);
    document.addEventListener("visibilitychange", onScroll);
    return () => { alive = false; image.onload = null; observer.disconnect(); visibility.disconnect(); window.removeEventListener("scroll", onScroll); window.removeEventListener("glass-style-change", onScroll); document.removeEventListener("visibilitychange", onScroll); cancelAnimationFrame(frame); gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); };
  }, [source, local]);
  return <canvas ref={ref} className="glass-lens" aria-hidden="true" />;
}
