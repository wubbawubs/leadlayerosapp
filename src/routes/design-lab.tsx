/**
 * /design-lab — Liquid OS (Design v5) living specimen.
 *
 * Every material, control and motion pattern proposed in
 * docs/DESIGN_V5_LIQUID_GLASS.md, as working code. Self-contained:
 * nothing here touches the live app's styles or components.
 *
 * Planes: 0 canvas (aurora) · 1 content (ink) · 2 glass (controls).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Home,
  Trophy,
  Layers,
  FileText,
  Zap,
  Trash2,
  Plus,
  Bell,
  Phone,
} from "lucide-react";
import { Mark } from "@/components/brand/Mark";

export const Route = createFileRoute("/design-lab")({
  component: DesignLab,
});

/* ── tiny interaction helpers ─────────────────────────────────────── */

/** Specular highlight follows the pointer across a glass surface. */
function spec(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/** Count-up number that runs once when it scrolls into view. */
function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1500;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 4);
          el.textContent = prefix + (to * eased).toFixed(decimals) + suffix;
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, decimals, prefix, suffix]);
  return <span ref={ref}>{prefix + (0).toFixed(decimals) + suffix}</span>;
}

/** Scroll-reveal: adds .in to every .rv as it enters the viewport. */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const scope = root.current;
    if (!scope) return;
    const els = scope.querySelectorAll<HTMLElement>(".rv");
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            (en.target as HTMLElement).classList.add("in");
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}

/* ── specimen components ──────────────────────────────────────────── */

function GlassButton({
  variant = "glass",
  size = "md",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "glass" | "amber" | "danger" | "ghost";
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      className={`lab-btn v-${variant} s-${size}`}
      onPointerMove={spec}
      {...props}
    >
      {children}
    </button>
  );
}

function Segmented() {
  const items = ["Overview", "Leads", "Pages"];
  const [idx, setIdx] = useState(0);
  return (
    <div className="lab-seg" role="tablist" aria-label="Demo segmented control">
      <span
        className="lab-seg-thumb"
        style={{ transform: `translateX(${idx * 100}%)` }}
        aria-hidden
      />
      {items.map((it, i) => (
        <button
          key={it}
          role="tab"
          aria-selected={i === idx}
          className={i === idx ? "on" : ""}
          onClick={() => setIdx(i)}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

function Toggle() {
  const [on, setOn] = useState(true);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`lab-toggle ${on ? "on" : ""}`}
      onClick={() => setOn(!on)}
    >
      <span className="knob" />
    </button>
  );
}

function Dock({ paper = false }: { paper?: boolean }) {
  const tabs = [
    { icon: Home, label: "Home" },
    { icon: Trophy, label: "Leads" },
    { icon: Layers, label: "Pages" },
    { icon: FileText, label: "Reports" },
  ];
  const [idx, setIdx] = useState(0);
  return (
    <nav className={`lab-dock ${paper ? "on-paper" : ""}`} aria-label="Demo dock">
      {tabs.map((t, i) => (
        <button
          key={t.label}
          type="button"
          className={i === idx ? "on" : ""}
          onClick={() => setIdx(i)}
        >
          <t.icon />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Hero showcase panel — pointer tilt + (Chromium) true refraction layer. */
function HeroPanel() {
  const ref = useRef<HTMLDivElement>(null);
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    spec(e);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -3.5;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 3.5;
    el.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }
  return (
    <div
      ref={ref}
      className="lab-hero-panel g spec rv"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="lens-layer" aria-hidden />
      <div className="lab-hero-panel-inner">
        <div className="lab-hero-head">
          <div className="row" style={{ gap: 10 }}>
            <Mark className="mk" />
            <div>
              <div className="hp-name">Smith HVAC</div>
              <div className="hp-sub">This month · live</div>
            </div>
          </div>
          <span className="live-dot-wrap">
            <span className="live-dot" /> LIVE
          </span>
        </div>

        <div className="lab-hero-kpis">
          <div>
            <div className="hp-k">
              <CountUp to={38} />
            </div>
            <div className="hp-l">
              Leads <em className="up">+9</em>
            </div>
          </div>
          <div>
            <div className="hp-k">
              <CountUp to={41.2} decimals={1} prefix="€" suffix="k" />
            </div>
            <div className="hp-l">
              Pipeline <em className="up">+€6.8k</em>
            </div>
          </div>
          <div>
            <div className="hp-k">
              <CountUp to={4.6} decimals={1} suffix="%" />
            </div>
            <div className="hp-l">
              Conversion <em className="up">+0.8</em>
            </div>
          </div>
        </div>

        <div className="lab-hero-actions">
          <GlassButton variant="amber">
            Open dashboard <ArrowRight />
          </GlassButton>
          <GlassButton variant="glass">
            <Phone /> Call back
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────── */

function DesignLab() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  return (
    <div ref={root} className="lab">
      <style>{CSS}</style>

      {/* Chromium-only true lensing filter — silently inert elsewhere */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="lab-lens" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.005 0.005" numOctaves="1" result="n" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      {/* PLANE 0 — canvas: aurora + grain */}
      <div className="lab-aurora" aria-hidden>
        <i className="a1" />
        <i className="a2" />
        <i className="a3" />
      </div>
      <div className="lab-grain" aria-hidden />

      {/* Floating glass nav */}
      <header className="lab-nav-wrap">
        <div className="lab-nav g spec" onPointerMove={spec}>
          <div className="row" style={{ gap: 10 }}>
            <Mark className="mk" />
            <span className="nav-brand">
              LeadLayer <em>OS</em>
            </span>
          </div>
          <nav className="lab-nav-links">
            <a className="on" href="#materials">
              Materials
            </a>
            <a href="#controls">Controls</a>
            <a href="#light">Light</a>
            <a href="#paper">Paper</a>
          </nav>
          <GlassButton variant="amber" size="sm">
            Sign in <ArrowRight />
          </GlassButton>
        </div>
      </header>

      {/* HERO */}
      <section className="lab-hero">
        <p className="kicker rv">LeadLayer OS · Design v5 proposal</p>
        <h1 className="rv" style={{ transitionDelay: "60ms" }}>
          Liquid <span className="grad">OS</span>
        </h1>
        <p className="lede rv" style={{ transitionDelay: "120ms" }}>
          Content stays ink on paper. Everything you <strong>touch</strong> becomes liquid glass —
          blurred, lit from above, and alive under the pointer. Three planes, like the mark: canvas,
          content, glass.
        </p>
        <HeroPanel />
        <p className="hint rv">move your cursor across the panel · press the buttons</p>
      </section>

      {/* 01 MATERIALS */}
      <section className="lab-sec" id="materials">
        <p className="sec-n rv">01 — Material</p>
        <h2 className="rv">Glass that proves it&apos;s real</h2>
        <p className="sec-p rv">
          The swatches float over a moving light field. If the material were paint, nothing behind
          it would matter. It does.
        </p>
        <div className="lab-lightfield rv">
          <div className="field-anim" aria-hidden />
          <div className="swatches">
            <div className="g spec sw" onPointerMove={spec}>
              <span className="sw-t">Dark glass</span>
              <span className="sw-d">chrome · rails · docks</span>
            </div>
            <div className="g-paper sw" onPointerMove={spec}>
              <span className="sw-t" style={{ color: "#1A1A1C" }}>
                Paper glass
              </span>
              <span className="sw-d" style={{ color: "#5A554E" }}>
                client surface
              </span>
            </div>
            <div className="g-amber spec sw" onPointerMove={spec}>
              <span className="sw-t" style={{ color: "#FFF8EE" }}>
                Liquid amber
              </span>
              <span className="sw-d" style={{ color: "rgba(255,248,238,0.8)" }}>
                one primary per screen
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 02 CONTROLS */}
      <section className="lab-sec" id="controls">
        <p className="sec-n rv">02 — Controls</p>
        <h2 className="rv">One button system. Four materials.</h2>
        <p className="sec-p rv">
          Capsule geometry, specular that tracks the pointer, and press physics — compress in
          90&nbsp;ms, spring back with 6% overshoot. Replaces <code>cta-shear</code>, shadcn
          defaults and every hand-rolled button.
        </p>

        <div className="ctrl-grid">
          <div className="ctrl-card g rv">
            <p className="ctrl-l">Primary · liquid amber</p>
            <div className="row wrap">
              <GlassButton variant="amber">
                Publish page <Zap />
              </GlassButton>
              <GlassButton variant="amber" size="sm">
                Add client <Plus />
              </GlassButton>
            </div>
          </div>
          <div className="ctrl-card g rv" style={{ transitionDelay: "60ms" }}>
            <p className="ctrl-l">Secondary · glass</p>
            <div className="row wrap">
              <GlassButton>Review brief</GlassButton>
              <GlassButton size="sm">
                <Bell /> Notify
              </GlassButton>
              <GlassButton variant="ghost" size="sm">
                Ghost
              </GlassButton>
              <GlassButton variant="danger" size="sm">
                <Trash2 /> Delete
              </GlassButton>
            </div>
          </div>
          <div className="ctrl-card g rv" style={{ transitionDelay: "120ms" }}>
            <p className="ctrl-l">Segmented · glass thumb, spring slide</p>
            <Segmented />
          </div>
          <div className="ctrl-card g rv" style={{ transitionDelay: "180ms" }}>
            <p className="ctrl-l">Switch · knob squishes while pressed</p>
            <div className="row" style={{ gap: 14 }}>
              <Toggle />
              <span className="ctrl-hint">hold it down</span>
            </div>
          </div>
        </div>
      </section>

      {/* 03 LIGHT = ELEVATION */}
      <section className="lab-sec" id="light">
        <p className="sec-n rv">03 — Depth</p>
        <h2 className="rv">Elevation is light, not paint</h2>
        <p className="sec-p rv">
          v3 stepped through flat hex values. v5 keeps the same four-step ladder but expresses it
          physically: higher objects gather more light — stronger rim, deeper blur, longer shadow.
        </p>
        <div className="elev-row rv">
          {[1, 2, 3, 4].map((l) => (
            <div key={l} className={`elev e${l}`}>
              <span className="elev-n">L{l}</span>
              <span className="elev-t">{["canvas", "surface", "raised", "floating"][l - 1]}</span>
            </div>
          ))}
        </div>

        <div className="kpi-row">
          {[
            { k: <CountUp to={214} />, l: "Leads this quarter", d: "+38" },
            { k: <CountUp to={97.4} decimals={1} suffix="%" />, l: "Pages indexed", d: "+2.1" },
            { k: <CountUp to={12} />, l: "Drafts awaiting review", d: "3 urgent" },
          ].map((t, i) => (
            <div
              key={t.l}
              className="g spec tile rv"
              style={{ transitionDelay: `${i * 70}ms` }}
              onPointerMove={spec}
            >
              <div className="tile-k">{t.k}</div>
              <div className="tile-l">{t.l}</div>
              <span className="tile-d">{t.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 04 PAPER */}
      <section className="lab-paper" id="paper">
        <div className="lab-paper-inner">
          <p className="sec-n rv" style={{ color: "#B45309" }}>
            04 — Client surface
          </p>
          <h2 className="rv" style={{ color: "#1A1A1C" }}>
            Paper stays paper. The chrome goes liquid.
          </h2>
          <p className="sec-p rv" style={{ color: "#5A554E" }}>
            The portal keeps its warm cream and sunlight-readable ink — the content plane never gets
            glass. But the dock the client touches every single visit becomes a floating instrument.
          </p>

          <div className="paper-demo rv">
            <div className="paper-kpis">
              {[
                { k: <CountUp to={9} />, l: "New leads", d: "+4 this week" },
                {
                  k: <CountUp to={12.4} decimals={1} prefix="€" suffix="k" />,
                  l: "Won value",
                  d: "+€3.1k",
                },
                { k: <CountUp to={7} />, l: "Pages live", d: "+2" },
              ].map((t) => (
                <div key={t.l} className="g-paper ptile">
                  <div className="ptile-k">{t.k}</div>
                  <div className="ptile-l">{t.l}</div>
                  <span className="ptile-d">{t.d}</span>
                </div>
              ))}
            </div>
            <div className="paper-cta-row">
              <GlassButton variant="amber">
                Bekijk je leads <ArrowRight />
              </GlassButton>
              <span className="paper-hint">liquid amber works on paper too</span>
            </div>
            <div className="paper-dock-stage">
              <Dock paper />
            </div>
          </div>
        </div>
      </section>

      {/* FINALE — dark dock */}
      <section className="lab-finale">
        <h2 className="rv">
          The architecture <span className="grad">is the logo.</span>
        </h2>
        <p className="sec-p rv" style={{ margin: "14px auto 40px", textAlign: "center" }}>
          Three stacked layers in the mark. Three planes in the product.
        </p>
        <div className="finale-dock rv">
          <Dock />
        </div>
        <p className="hint rv" style={{ marginTop: 28 }}>
          spec: docs/DESIGN_V5_LIQUID_GLASS.md · nothing in the live app was changed
        </p>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LIQUID OS — specimen stylesheet (scoped to .lab)
   ══════════════════════════════════════════════════════════════════ */
const CSS = /* css */ `
.lab {
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --amber: #E8913A; --amber-hot: #F0A050; --amber-deep: #B45309;
  --accent: #E8913A; --brand-orange-deep: #B45309; /* pin for <Mark> */
  position: relative;
  min-height: 100vh;
  background: #07080A;
  color: #F5F2EC;
  font-family: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}
.lab, .lab *, .lab *::before, .lab *::after { box-sizing: border-box; }
.lab .row { display: flex; align-items: center; }
.lab .wrap { flex-wrap: wrap; gap: 12px; }
.lab .mk { height: 26px; width: 26px; flex-shrink: 0; }
.lab code {
  font: 500 0.85em ui-monospace, monospace;
  background: rgba(255,255,255,0.08);
  padding: 1px 6px; border-radius: 6px;
}

/* ── PLANE 0: aurora canvas ──────────────────────────────────────── */
.lab-aurora { position: fixed; inset: -25%; z-index: 0; pointer-events: none; filter: blur(90px); }
.lab-aurora i { position: absolute; border-radius: 50%; display: block; }
.lab-aurora .a1 {
  width: 55vw; height: 55vw; left: 8%; top: 4%;
  background: radial-gradient(circle, rgba(232,145,58,0.16), transparent 65%);
  animation: drift1 46s ease-in-out infinite alternate;
}
.lab-aurora .a2 {
  width: 45vw; height: 45vw; right: 2%; top: 28%;
  background: radial-gradient(circle, rgba(59,95,214,0.12), transparent 65%);
  animation: drift2 58s ease-in-out infinite alternate;
}
.lab-aurora .a3 {
  width: 50vw; height: 50vw; left: 30%; bottom: -6%;
  background: radial-gradient(circle, rgba(180,83,9,0.12), transparent 65%);
  animation: drift3 52s ease-in-out infinite alternate;
}
@keyframes drift1 { to { transform: translate(14vw, 10vh) scale(1.15); } }
@keyframes drift2 { to { transform: translate(-12vw, -8vh) scale(0.9); } }
@keyframes drift3 { to { transform: translate(-10vw, -12vh) scale(1.2); } }
.lab-grain {
  position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.5;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}
.lab > section, .lab > header { position: relative; z-index: 2; }

/* ── PLANE 2: glass materials ────────────────────────────────────── */
.g {
  position: relative;
  background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03));
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.20),
    inset 0 -1px 0 rgba(255,255,255,0.04),
    0 1px 2px rgba(0,0,0,0.30),
    0 16px 40px -12px rgba(0,0,0,0.50);
}
.g::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  padding: 1px; pointer-events: none;
  background: linear-gradient(135deg,
    rgba(255,255,255,0.45), rgba(255,255,255,0.06) 38%,
    rgba(255,255,255,0.02) 62%, rgba(255,255,255,0.28));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
}
.spec::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  pointer-events: none; opacity: 0; transition: opacity 0.35s var(--ease-out);
  background: radial-gradient(160px circle at var(--mx, 50%) var(--my, 0%),
    rgba(255,255,255,0.16), transparent 55%);
}
.spec:hover::after { opacity: 1; }

.g-paper {
  position: relative;
  background: linear-gradient(135deg, rgba(255,255,255,0.60), rgba(255,255,255,0.28));
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.85),
    0 1px 2px rgba(26,26,28,0.06),
    0 12px 32px -12px rgba(26,26,28,0.20);
}
.g-amber {
  position: relative;
  background: linear-gradient(135deg, rgba(240,160,70,0.95), rgba(200,105,10,0.85));
  backdrop-filter: blur(12px) saturate(160%);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.45),
    inset 0 -2px 6px rgba(120,55,0,0.35),
    0 8px 28px -6px rgba(232,145,58,0.45);
}

/* ── nav ─────────────────────────────────────────────────────────── */
.lab-nav-wrap {
  position: sticky; top: 14px; z-index: 50;
  display: flex; justify-content: center; padding: 0 16px;
}
.lab-nav {
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  width: 100%; max-width: 860px; height: 56px; border-radius: 28px;
  padding: 0 10px 0 20px;
}
.nav-brand { font-weight: 800; font-size: 15px; letter-spacing: -0.01em; white-space: nowrap; }
.nav-brand em { font-style: normal; color: var(--amber); }
.lab-nav-links { display: flex; gap: 4px; }
.lab-nav-links a {
  color: rgba(245,242,236,0.60); text-decoration: none;
  font-size: 13.5px; font-weight: 600;
  height: 36px; display: inline-flex; align-items: center;
  padding: 0 14px; border-radius: 18px;
  transition: color 0.2s, background-color 0.2s;
}
.lab-nav-links a:hover { color: #F5F2EC; background: rgba(255,255,255,0.08); }
.lab-nav-links a.on { color: #F5F2EC; background: rgba(255,255,255,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.15); }
@media (max-width: 720px) { .lab-nav-links { display: none; } }

/* ── hero ────────────────────────────────────────────────────────── */
.lab-hero { max-width: 980px; margin: 0 auto; padding: 96px 24px 40px; text-align: center; }
.kicker {
  font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(245,242,236,0.45);
}
.lab-hero h1 {
  margin: 18px 0 0; font-size: clamp(56px, 10vw, 118px); font-weight: 800;
  letter-spacing: -0.045em; line-height: 0.98;
}
.grad {
  background: linear-gradient(100deg, #F0A050 10%, #E8913A 45%, #D97706 75%, #F5C98A);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lede {
  margin: 22px auto 0; max-width: 560px;
  font-size: 17px; line-height: 1.6; color: rgba(245,242,236,0.62);
}
.lede strong { color: #F5F2EC; font-weight: 700; }
.hint { margin-top: 22px; font-size: 12.5px; color: rgba(245,242,236,0.35); }

.lab-hero-panel {
  margin: 56px auto 0; max-width: 640px; border-radius: 32px; text-align: left;
  transition: transform 0.5s var(--ease-out);
  will-change: transform;
}
.lens-layer {
  position: absolute; inset: 10px; border-radius: 24px; pointer-events: none;
  backdrop-filter: url(#lab-lens);
  -webkit-backdrop-filter: url(#lab-lens);
}
.lab-hero-panel-inner { position: relative; padding: 26px 28px 28px; }
.lab-hero-head { display: flex; align-items: center; justify-content: space-between; }
.hp-name { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
.hp-sub { font-size: 12.5px; color: rgba(245,242,236,0.45); }
.live-dot-wrap {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 10.5px; font-weight: 800; letter-spacing: 0.18em;
  color: rgba(245,242,236,0.55);
  border-radius: 14px; padding: 6px 12px;
  background: rgba(255,255,255,0.07);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.10);
}
.live-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--amber); box-shadow: 0 0 10px rgba(232,145,58,0.9);
  animation: livepulse 2.2s ease-in-out infinite;
}
@keyframes livepulse { 50% { opacity: 0.4; } }
.lab-hero-kpis {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 26px;
}
.hp-k {
  font-size: clamp(26px, 4.6vw, 38px); font-weight: 800; letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.hp-l { margin-top: 2px; font-size: 12.5px; color: rgba(245,242,236,0.50); }
.hp-l .up, .tile-d, .ptile-d { font-style: normal; }
.up { color: #5BD08A; font-weight: 700; margin-left: 4px; }
.lab-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }

/* ── buttons ─────────────────────────────────────────────────────── */
.lab-btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; height: 48px; padding: 0 26px; border: 0; border-radius: 24px;
  cursor: pointer; white-space: nowrap;
  font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: 0.005em;
  color: #F5F2EC; -webkit-tap-highlight-color: transparent;
  transition: transform 0.35s var(--spring), box-shadow 0.35s var(--spring),
    background-color 0.25s var(--ease-out), color 0.25s var(--ease-out);
}
.lab-btn svg { width: 17px; height: 17px; flex-shrink: 0; }
.lab-btn:active { transform: scale(0.965); transition-duration: 0.09s; }
.lab-btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.lab-btn.s-sm { height: 38px; padding: 0 18px; border-radius: 19px; font-size: 13.5px; }
.lab-btn.s-sm svg { width: 15px; height: 15px; }

.lab-btn.v-glass {
  background: linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.05));
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(255,255,255,0.06),
    0 2px 6px rgba(0,0,0,0.25), 0 10px 24px -10px rgba(0,0,0,0.45);
}
.lab-btn.v-glass:hover { background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08)); }
.lab-btn.v-glass.spec::after { opacity: 0; }
.lab-btn.v-glass.spec:hover::after { opacity: 1; }

.lab-btn.v-amber {
  color: #1E1204;
  background: linear-gradient(135deg, rgba(244,172,86,0.98), rgba(210,110,8,0.92));
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 6px rgba(120,55,0,0.30),
    0 2px 6px rgba(0,0,0,0.25), 0 10px 30px -6px rgba(232,145,58,0.50);
  overflow: hidden;
}
.lab-btn.v-amber::after {
  content: ""; position: absolute; top: -20%; bottom: -20%; left: -60%;
  width: 45%; transform: skewX(-22deg) translateX(0);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
  transition: transform 0.7s var(--ease-out); pointer-events: none;
}
.lab-btn.v-amber:hover::after { transform: skewX(-22deg) translateX(340%); }
.lab-btn.v-amber:hover { box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.60), inset 0 -2px 6px rgba(120,55,0,0.30),
  0 2px 8px rgba(0,0,0,0.30), 0 14px 40px -6px rgba(232,145,58,0.65); }

.lab-btn.v-danger {
  color: #FFD9D9;
  background: linear-gradient(135deg, rgba(229,77,77,0.30), rgba(180,40,40,0.20));
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  box-shadow: inset 0 1px 0 rgba(255,150,150,0.25), inset 0 0 0 1px rgba(229,77,77,0.25),
    0 2px 6px rgba(0,0,0,0.25);
}
.lab-btn.v-danger:hover { background: linear-gradient(135deg, rgba(229,77,77,0.42), rgba(180,40,40,0.30)); }

.lab-btn.v-ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14);
  color: rgba(245,242,236,0.75);
}
.lab-btn.v-ghost:hover {
  background: rgba(255,255,255,0.07); color: #F5F2EC;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,0.18);
}

/* ── segmented + toggle ──────────────────────────────────────────── */
.lab-seg {
  position: relative; display: grid; grid-template-columns: repeat(3, 1fr);
  width: fit-content; padding: 4px; border-radius: 22px;
  background: rgba(0,0,0,0.35);
  box-shadow: inset 0 1px 4px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.06);
}
.lab-seg button {
  position: relative; z-index: 1; height: 36px; padding: 0 20px; border: 0;
  border-radius: 18px; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 13.5px; font-weight: 700;
  color: rgba(245,242,236,0.55); transition: color 0.25s var(--ease-out);
}
.lab-seg button.on { color: #14100A; }
.lab-seg button:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.lab-seg-thumb {
  position: absolute; z-index: 0; top: 4px; left: 4px;
  width: calc((100% - 8px) / 3); height: 36px; border-radius: 18px;
  background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(235,230,220,0.88));
  box-shadow: inset 0 1px 0 #fff, 0 2px 10px rgba(0,0,0,0.40);
  transition: transform 0.45s var(--spring);
}
.lab-toggle {
  position: relative; width: 56px; height: 32px; border: 0; border-radius: 16px;
  cursor: pointer; padding: 0;
  background: rgba(255,255,255,0.12);
  box-shadow: inset 0 1px 4px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08);
  transition: background 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out);
}
.lab-toggle.on {
  background: linear-gradient(135deg, #F0A050, #C8690A);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.40), 0 2px 14px rgba(232,145,58,0.45);
}
.lab-toggle:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.lab-toggle .knob {
  position: absolute; top: 2px; left: 2px; width: 28px; height: 28px; border-radius: 14px;
  background: linear-gradient(180deg, #FFFFFF, #E9E4DA);
  box-shadow: 0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 #fff;
  transition: left 0.4s var(--spring), width 0.18s var(--ease-out);
}
.lab-toggle.on .knob { left: calc(100% - 30px); }
.lab-toggle:active .knob { width: 34px; }
.lab-toggle.on:active .knob { left: calc(100% - 36px); }

/* ── sections ────────────────────────────────────────────────────── */
.lab-sec { max-width: 980px; margin: 0 auto; padding: 110px 24px 0; }
.sec-n {
  font-size: 12.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--amber);
}
.lab-sec h2, .lab-paper h2, .lab-finale h2 {
  margin: 12px 0 0; font-size: clamp(30px, 4.6vw, 46px); font-weight: 800;
  letter-spacing: -0.035em; line-height: 1.05;
}
.sec-p { margin: 14px 0 0; max-width: 560px; font-size: 15.5px; line-height: 1.65; color: rgba(245,242,236,0.58); }

/* light field + swatches */
.lab-lightfield {
  position: relative; margin-top: 36px; border-radius: 32px; overflow: hidden;
  padding: 44px 28px; min-height: 260px;
  display: flex; align-items: center; justify-content: center;
}
.field-anim {
  position: absolute; inset: 0;
  background:
    radial-gradient(40% 60% at 20% 30%, rgba(232,145,58,0.55), transparent 60%),
    radial-gradient(35% 55% at 75% 25%, rgba(59,95,214,0.45), transparent 60%),
    radial-gradient(45% 60% at 55% 80%, rgba(217,119,6,0.40), transparent 60%),
    #0C0D10;
  animation: fieldpan 14s ease-in-out infinite alternate;
}
@keyframes fieldpan { to { transform: scale(1.35) rotate(8deg); } }
.swatches {
  position: relative; display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 16px; width: 100%; max-width: 760px;
}
@media (max-width: 720px) { .swatches { grid-template-columns: 1fr; } }
.sw {
  border-radius: 24px; padding: 22px 20px; min-height: 120px;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 3px;
}
.sw-t { font-size: 15.5px; font-weight: 800; letter-spacing: -0.01em; }
.sw-d { font-size: 12.5px; color: rgba(245,242,236,0.55); }

/* control cards */
.ctrl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 36px; }
@media (max-width: 760px) { .ctrl-grid { grid-template-columns: 1fr; } }
.ctrl-card { border-radius: 28px; padding: 24px; }
.ctrl-l { margin: 0 0 16px; font-size: 12.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(245,242,236,0.42); }
.ctrl-hint { font-size: 12.5px; color: rgba(245,242,236,0.38); }

/* elevation */
.elev-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 36px; }
@media (max-width: 720px) { .elev-row { grid-template-columns: repeat(2, 1fr); } }
.elev {
  height: 120px; border-radius: 24px; padding: 18px;
  display: flex; flex-direction: column; justify-content: flex-end; gap: 2px;
  position: relative;
}
.elev-n { font-size: 17px; font-weight: 800; }
.elev-t { font-size: 12px; color: rgba(245,242,236,0.5); }
.elev.e1 { background: #0C0D10; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }
.elev.e2 {
  background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
  backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px -4px rgba(0,0,0,0.4);
}
.elev.e3 {
  background: linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03));
  backdrop-filter: blur(16px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 10px 24px -8px rgba(0,0,0,0.5);
}
.elev.e4 {
  background: linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.05));
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.26), 0 20px 48px -12px rgba(0,0,0,0.65);
  transform: translateY(-8px);
}

/* KPI tiles */
.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 44px; }
@media (max-width: 720px) { .kpi-row { grid-template-columns: 1fr; } }
.tile { border-radius: 28px; padding: 24px; }
.tile-k { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.tile-l { margin-top: 4px; font-size: 13.5px; color: rgba(245,242,236,0.55); }
.tile-d {
  display: inline-flex; margin-top: 14px; padding: 5px 12px; border-radius: 13px;
  font-size: 12px; font-weight: 700; color: #7FE0A5;
  background: rgba(39,166,68,0.16);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(39,166,68,0.25);
}

/* ── paper band ──────────────────────────────────────────────────── */
.lab-paper {
  margin-top: 130px; background: #F5F0E8; position: relative;
  background-image:
    radial-gradient(60% 80% at 85% 0%, rgba(232,145,58,0.10), transparent 60%),
    radial-gradient(circle at 25% 30%, rgba(180,140,80,0.05), transparent 40%);
}
.lab-paper-inner { max-width: 980px; margin: 0 auto; padding: 100px 24px 110px; }
.paper-demo { margin-top: 40px; }
.paper-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 720px) { .paper-kpis { grid-template-columns: 1fr; } }
.ptile { border-radius: 28px; padding: 24px; }
.ptile::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(191,179,149,0.35));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
}
.ptile-k { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; color: #1A1A1C; font-variant-numeric: tabular-nums; }
.ptile-l { margin-top: 4px; font-size: 13.5px; color: #5A554E; }
.ptile-d {
  display: inline-flex; margin-top: 14px; padding: 5px 12px; border-radius: 13px;
  font-size: 12px; font-weight: 700; color: #1F7A36;
  background: rgba(31,122,54,0.10);
  box-shadow: inset 0 0 0 1px rgba(31,122,54,0.22);
}
.paper-cta-row { display: flex; align-items: center; gap: 16px; margin-top: 28px; flex-wrap: wrap; }
.paper-hint { font-size: 13px; color: #8C8884; }
.paper-dock-stage { display: flex; justify-content: center; padding: 56px 0 0; }

/* ── dock ────────────────────────────────────────────────────────── */
.lab-dock {
  display: inline-flex; gap: 6px; padding: 8px; border-radius: 28px;
  background: linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04));
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.06),
    0 2px 6px rgba(0,0,0,0.3), 0 24px 60px -16px rgba(0,0,0,0.7);
}
.lab-dock button {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; width: 72px; height: 58px; border: 0; border-radius: 20px;
  background: transparent; cursor: pointer;
  color: rgba(245,242,236,0.52); font-family: inherit; font-size: 10.5px; font-weight: 700;
  transition: transform 0.35s var(--spring), background-color 0.25s var(--ease-out),
    color 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
.lab-dock button svg { width: 20px; height: 20px; }
.lab-dock button:hover { color: #F5F2EC; background: rgba(255,255,255,0.07); transform: translateY(-2px); }
.lab-dock button:active { transform: scale(0.94); transition-duration: 0.09s; }
.lab-dock button:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.lab-dock button.on {
  color: var(--amber-hot); background: rgba(255,255,255,0.13);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.20), inset 0 0 0 1px rgba(255,255,255,0.05);
}
.lab-dock.on-paper {
  background: linear-gradient(135deg, rgba(45,45,45,0.92), rgba(31,31,31,0.88));
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(255,255,255,0.04),
    0 2px 6px rgba(26,26,28,0.18), 0 24px 56px -16px rgba(26,26,28,0.45);
}

/* ── finale ──────────────────────────────────────────────────────── */
.lab-finale { max-width: 980px; margin: 0 auto; padding: 130px 24px 140px; text-align: center; }
.finale-dock { display: flex; justify-content: center; }

/* ── reveal ──────────────────────────────────────────────────────── */
.rv {
  opacity: 0; transform: translateY(26px); filter: blur(8px);
  transition: opacity 0.9s var(--ease-out), transform 0.9s var(--ease-out), filter 0.9s var(--ease-out);
}
.rv.in { opacity: 1; transform: none; filter: none; }

/* ── a11y fallbacks ──────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .lab *, .lab *::before, .lab *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .rv { opacity: 1; transform: none; filter: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .lab .g, .lab .lab-btn.v-glass, .lab .lab-dock { background: #1A1C20; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .lab .g-paper, .lab .ptile { background: #FDFAF3; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .lab .lens-layer { display: none; }
}
`;
