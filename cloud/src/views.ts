import { html, raw } from "hono/html";
import type { ApiKeyRow } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// workdir — site + console UI
// Warm graphite + ember amber. Geist Pixel display, IBM Plex Mono chrome,
// Schibsted Grotesk prose. Hairline borders, square corners, honest numbers.
// ─────────────────────────────────────────────────────────────────────────────

const STYLES = `
  @font-face {
    font-family:"Geist Pixel";
    src:url("https://cdn.jsdelivr.net/gh/vercel/geist-font@v1.7.2/fonts/GeistPixel/webfonts/GeistPixel-Square.woff2") format("woff2");
    font-weight:400; font-style:normal; font-display:swap;
  }
  :root {
    --bg:#0a0908; --bg1:#0e0d0b; --bg2:#0c0b09;
    --line:#211f19; --line2:#2e2b22;
    --fg:#ede9de; --body:#b9b3a4; --muted:#8e8878; --faint:#5c5749;
    --amber:#ffb224; --amber2:#ffc95e; --ember:#ff7a1a;
    --ok:#8cd98c; --err:#ff6b5e;
    --sans:"Schibsted Grotesk",system-ui,-apple-system,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
    --pixel:"Geist Pixel","IBM Plex Mono",ui-monospace,monospace;
  }
  * { box-sizing:border-box; }
  html { scrollbar-color:var(--line2) var(--bg); }
  body {
    margin:0; background:var(--bg); color:var(--fg);
    font-family:var(--sans); font-size:16px; line-height:1.6;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  }
  body::after {
    content:""; position:fixed; inset:0; z-index:2000; pointer-events:none; opacity:.26;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.05'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  ::selection { background:var(--amber); color:#0a0908; }
  a { color:var(--amber); text-decoration:none; }
  a:hover { text-decoration:underline; text-underline-offset:3px; }
  code, pre { font-family:var(--mono); }
  .wrap { max-width:1100px; margin:0 auto; padding:0 24px; }

  /* ── page rails (gutter) ─────────────────────────────────────────────── */
  .rails {
    position:fixed; top:0; bottom:0; left:50%; transform:translateX(-50%);
    width:min(calc(100% - 32px), 1148px);
    border-left:1px solid var(--line); border-right:1px solid var(--line);
    pointer-events:none; z-index:0;
  }

  /* ── nav ─────────────────────────────────────────────────────────────── */
  header.nav { position:relative; z-index:50; background:transparent; }
  header.nav.app { border-bottom:1px solid var(--line); }
  .nav-in {
    display:grid; grid-template-columns:1fr auto 1fr; align-items:center; height:48px;
  }
  .logo { font:400 15px/1 var(--pixel); letter-spacing:.02em; color:var(--fg); grid-column:2; grid-row:1; justify-self:center; }
  .logo:hover { text-decoration:none; color:var(--amber); }
  .nav-links { display:flex; gap:22px; grid-column:1; grid-row:1; justify-self:start; }
  .nav-links a {
    font:400 12.5px var(--mono); color:var(--muted); padding-bottom:2px;
    background:linear-gradient(var(--amber),var(--amber)) left bottom / 0 1px no-repeat;
    transition:background-size .22s ease, color .15s;
  }
  .nav-links a:hover { color:var(--fg); text-decoration:none; background-size:100% 1px; }
  .nav-cta { grid-column:3; grid-row:1; justify-self:end; display:flex; gap:10px; align-items:center; }
  .nav-cta form { margin:0; }

  .umenu { position:relative; }
  .umenu summary {
    list-style:none; cursor:pointer; width:30px; height:30px;
    display:grid; place-items:center; border:1px solid var(--line2);
    color:var(--muted); font:600 15px/1 var(--mono); user-select:none;
    transition:border-color .15s, color .15s;
  }
  .umenu summary::-webkit-details-marker { display:none; }
  .umenu summary:hover, .umenu[open] summary { border-color:var(--amber); color:var(--amber); }
  .umenu .pop {
    position:absolute; right:0; top:38px; width:230px; z-index:60;
    background:var(--bg1); border:1px solid var(--line2); padding:14px;
    box-shadow:0 18px 50px rgba(0,0,0,.5);
  }
  .pop-id { margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--line); }
  .pop-name { display:block; font:600 13px var(--mono); color:var(--fg); }
  .pop-mail { display:block; font:400 11.5px var(--mono); color:var(--muted); margin-top:3px; word-break:break-all; }

  /* ── buttons & inputs ────────────────────────────────────────────────── */
  .btn {
    font:500 13px/1 var(--mono); letter-spacing:.01em;
    padding:11px 18px; border:1px solid var(--line2);
    background:transparent; color:var(--fg); cursor:pointer;
    display:inline-flex; align-items:center; gap:8px;
    transition:border-color .15s, background .15s, color .15s, box-shadow .15s;
  }
  .btn:hover { border-color:var(--amber); color:var(--amber); text-decoration:none; }
  .btn.primary { background:var(--amber); border-color:var(--amber); color:#0a0908; font-weight:600; }
  .btn.primary:hover { background:var(--amber2); border-color:var(--amber2); color:#0a0908; }
  .btn.danger { color:var(--err); border-color:#3a2520; }
  .btn.danger:hover { border-color:var(--err); background:rgba(255,107,94,.08); color:var(--err); }
  .btn.sm { padding:8px 13px; font-size:12px; }
  .btn.xs { padding:6px 10px; font-size:11px; }
  .btn.block { width:100%; justify-content:center; }
  .btn .ar { display:inline-block; transition:transform .18s ease; }
  .btn:hover .ar { transform:translateX(3px); }

  label {
    display:block; font:500 11px var(--mono); letter-spacing:.14em;
    text-transform:uppercase; color:var(--muted); margin:18px 0 8px;
  }
  input[type=email], input[type=password], input[type=text] {
    width:100%; padding:12px 14px; background:var(--bg2);
    border:1px solid var(--line2); color:var(--fg);
    font:400 14px var(--mono); transition:border-color .15s, box-shadow .15s;
  }
  input::placeholder { color:var(--faint); }
  input:focus { outline:none; border-color:var(--amber); box-shadow:0 0 0 3px rgba(255,178,36,.12); }

  /* ── shared chrome ───────────────────────────────────────────────────── */
  .corners { position:relative; }
  .corners::before, .corners::after {
    content:""; position:absolute; width:9px; height:9px;
    border:0 solid var(--amber); opacity:.9; pointer-events:none;
  }
  .corners::before { top:-1px; left:-1px; border-top-width:1px; border-left-width:1px; }
  .corners::after { bottom:-1px; right:-1px; border-bottom-width:1px; border-right-width:1px; }

  .kicker {
    font:500 11px var(--mono); letter-spacing:.18em; text-transform:uppercase;
    color:var(--muted); display:flex; align-items:center; gap:12px; margin-bottom:20px;
  }
  .kicker b { color:var(--amber); font-weight:600; }
  .kicker .kline { height:1px; flex:1; background:var(--line); }
  .kicker .kidx { color:var(--faint); letter-spacing:.14em; }

  section.block { position:relative; padding:88px 0; border-top:1px solid var(--line); }
  section.block::before, section.block::after {
    content:"+"; position:absolute; top:-9.5px; font:400 13px/1 var(--mono);
    color:#3a3526; pointer-events:none;
  }
  section.block::before { left:max(16px, calc(50% - 574px)); transform:translateX(-50%); }
  section.block::after { right:max(16px, calc(50% - 574px)); transform:translateX(50%); }

  .h2 { font:400 clamp(21px,2.9vw,31px)/1.25 var(--pixel); letter-spacing:.01em; margin:0 0 14px; }
  .lead { color:var(--body); font-size:16px; max-width:580px; margin:0; }

  .copy {
    font:500 11px var(--mono); color:var(--faint); background:none;
    border:1px solid var(--line2); padding:4px 11px; cursor:pointer;
    transition:color .15s, border-color .15s;
  }
  .copy:hover { color:var(--amber); border-color:var(--amber); }
  .copy.copied { color:var(--ok); border-color:var(--ok); }

  /* ── hero ────────────────────────────────────────────────────────────── */
  .hero { position:relative; margin-top:-48px; padding:114px 0 0; overflow:hidden; }
  .hero-bg {
    position:absolute; inset:0; pointer-events:none;
    background-image:
      linear-gradient(rgba(237,233,222,.016) 1px, transparent 1px),
      linear-gradient(90deg, rgba(237,233,222,.016) 1px, transparent 1px);
    background-size:16px 16px;
    -webkit-mask-image:linear-gradient(180deg, #000 55%, transparent 96%);
    mask-image:linear-gradient(180deg, #000 55%, transparent 96%);
  }
  .hero-bg::before {
    content:""; position:absolute; inset:0; opacity:.3;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.05'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    animation:grain .9s steps(1) infinite;
  }
  @keyframes grain {
    0%, 100% { background-position:0 0; }
    20% { background-position:-34px 12px; }
    40% { background-position:22px -26px; }
    60% { background-position:-14px -38px; }
    80% { background-position:36px 20px; }
  }
  .hero-bg .spark {
    position:absolute; width:16px; height:16px; opacity:0;
    background:rgba(255,178,36,.04);
    box-shadow:inset 0 0 0 1px rgba(255,178,36,.13);
    animation:sparkle 7.7s ease-in-out infinite; animation-delay:var(--sd,0s);
  }
  @keyframes sparkle { 0%, 84%, 100% { opacity:0; } 90%, 95% { opacity:1; } }

  .hero-grid {
    position:relative; display:grid; grid-template-columns:.82fr 1.18fr;
    gap:48px; align-items:center;
  }
  .hero-grid > * { min-width:0; }
  .hero-tag { font:400 12.5px var(--mono); color:var(--muted); margin-bottom:22px; }
  .hero-tag b { color:var(--amber); font-weight:500; }
  h1.display {
    font:400 clamp(26px,3.4vw,38px)/1.2 var(--pixel);
    letter-spacing:.01em; margin:0 0 18px;
  }
  h1.display em { font-style:normal; color:var(--amber); }
  .hero p.sub { color:var(--body); font-size:15.5px; max-width:460px; margin:0 0 28px; }
  .hero-ctas { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .hero-foot { font:400 12px var(--mono); color:var(--faint); margin-top:26px; }
  .hero-foot a { color:var(--muted); }

  /* ── terminal ────────────────────────────────────────────────────────── */
  .term {
    background:#0c0b09; border:1px solid var(--line2); border-radius:9px; overflow:hidden;
    box-shadow:0 1px 0 rgba(237,233,222,.04) inset, 0 30px 90px rgba(0,0,0,.6);
    font:400 13px/2.05 var(--mono);
  }
  .term-bar {
    display:grid; grid-template-columns:1fr auto 1fr; align-items:center;
    height:38px; padding:0 14px; background:#11100d;
    border-bottom:1px solid var(--line); color:var(--faint); font-size:11px;
  }
  .term-lights { display:flex; gap:8px; }
  .t-dot { width:11px; height:11px; border-radius:50%; }
  .t-dot.r { background:#e0443e; } .t-dot.y { background:#dea123; } .t-dot.g { background:#1aab29; }
  .term-title { justify-self:center; color:var(--muted); }
  .term-host { justify-self:end; display:flex; align-items:center; gap:7px; }
  .term-host::before {
    content:""; width:6px; height:6px; border-radius:50%;
    background:var(--ok); box-shadow:0 0 8px rgba(140,217,140,.8);
  }
  .term-body { padding:22px 22px 18px; min-height:368px; overflow-x:auto; }
  .t-line, .t-out, .t-trace, .t-kv { opacity:0; animation:tIn .18s ease-out forwards; animation-delay:var(--d); }
  .t-p { color:var(--amber); margin-right:1ch; }
  .t-cmd {
    display:inline-block; overflow:hidden; white-space:pre; vertical-align:bottom;
    width:0; max-width:calc(100% - 2ch); animation-fill-mode:forwards; animation-delay:var(--d);
  }
  .t-cmd.c1 { animation-name:type1; animation-duration:.5s; animation-timing-function:steps(14,end); }
  .t-cmd.c2 { animation-name:type2; animation-duration:1.05s; animation-timing-function:steps(53,end); }
  .t-cmd.c3 { animation-name:type3; animation-duration:.55s; animation-timing-function:steps(24,end); }
  @keyframes type1 { to { width:14ch; } }
  @keyframes type2 { to { width:53ch; } }
  @keyframes type3 { to { width:24ch; } }
  @keyframes tIn { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:none; } }
  @keyframes blink { 0%,55% { opacity:1; } 56%,100% { opacity:0; } }
  .t-arrow { color:var(--ok); }
  .t-dim { color:var(--faint); }
  .t-em { color:var(--amber); }
  .t-kv { display:grid; grid-template-columns:11ch auto; padding-left:2ch; }
  .t-kv .k, .t-trace .k { color:var(--faint); }
  .t-trace { display:grid; grid-template-columns:11ch 6ch 1fr; align-items:center; padding-left:2ch; }
  .t-ms { color:var(--muted); }
  .t-bar {
    height:7px; width:var(--w); transform:scaleX(0); transform-origin:left;
    background:linear-gradient(90deg, var(--amber), var(--ember));
    box-shadow:0 0 10px rgba(255,140,26,.35);
    animation:grow .45s cubic-bezier(.2,.7,.2,1) forwards; animation-delay:var(--d);
  }
  @keyframes grow { to { transform:scaleX(1); } }
  .t-ready { color:var(--fg); font-weight:600; }
  .t-cursor {
    display:inline-block; width:.65ch; height:1.1em; background:var(--amber);
    vertical-align:text-bottom; animation:blink 1.1s steps(1) infinite;
  }
  /* ── stat strip ──────────────────────────────────────────────────────── */
  .stats {
    position:relative; display:grid; grid-template-columns:repeat(4,1fr);
    gap:1px; background:var(--line); border:1px solid var(--line); margin-top:78px;
  }
  .stats > * { min-width:0; }
  .stat { background:var(--bg); padding:22px 24px; }
  .stat span {
    display:block; font:500 10.5px var(--mono); letter-spacing:.16em;
    text-transform:uppercase; color:var(--faint); margin-bottom:8px;
  }
  .stat b { font:400 24px/1 var(--pixel); color:var(--fg); }
  .stat b small { font-size:13px; color:var(--muted); font-weight:400; }
  .stat.hot b { color:var(--amber); }

  /* ── spec / comparison tables ────────────────────────────────────────── */
  .twrap { overflow-x:auto; border:1px solid var(--line); margin-top:44px; }
  table.spec { width:100%; min-width:560px; border-collapse:collapse; font:400 13px var(--mono); table-layout:fixed; }
  .spec th {
    text-align:left; padding:12px 18px; border-bottom:1px solid var(--line);
    font:500 10.5px var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--faint);
  }
  .spec td { padding:13px 18px; border-bottom:1px solid var(--line); color:var(--muted); }
  .spec tr:last-child td { border-bottom:0; }
  .spec td:first-child { color:var(--fg); }
  .spec td b { color:var(--amber); font-weight:600; }
  .spec td i { color:var(--faint); font-style:normal; }
  .spec tbody tr { transition:background .15s; }
  .spec tbody tr:hover { background:var(--bg1); }

  table.cmp td:first-child {
    color:var(--faint); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase;
  }
  .cmp th.wd, .cmp td.wd {
    color:var(--fg); background:rgba(255,178,36,.04);
    box-shadow:inset 1px 0 0 var(--line2), inset -1px 0 0 var(--line2);
  }
  .cmp th.wd { color:var(--amber); }
  .cmp td.wd b { color:var(--amber); font-weight:600; }
  .tnote { font:400 11.5px/1.8 var(--mono); color:var(--faint); margin:14px 0 0; max-width:640px; }
  .tnote a { color:var(--muted); }
  .supref {
    background:none; border:0; padding:0 0 0 2px; cursor:pointer;
    font:600 10px var(--mono); color:var(--amber); vertical-align:super;
  }
  .supref:hover { color:var(--amber2); }
  .srclink {
    background:none; border:0; padding:0; cursor:pointer;
    font:400 11.5px var(--mono); color:var(--muted);
    border-bottom:1px dotted var(--faint); transition:color .15s, border-color .15s;
  }
  .srclink:hover { color:var(--amber); border-color:var(--amber); }

  dialog.modal {
    background:var(--bg1); border:1px solid var(--line2); color:var(--body);
    width:min(640px, calc(100vw - 40px)); padding:0; margin:auto; overflow:hidden;
  }
  dialog.modal::backdrop { background:rgba(6,5,4,.72); backdrop-filter:blur(3px); }
  .mtab { width:100%; border-collapse:collapse; margin:0 0 14px; }
  .mtab td { padding:9px 0; border-top:1px solid var(--line); vertical-align:top; }
  .mtab tr:first-child td { border-top:0; }
  .mtab td:first-child {
    font:600 12px var(--mono); color:var(--amber); white-space:nowrap;
    width:140px; padding-right:18px;
  }
  .mtab td:last-child { font:400 12.5px/1.65 var(--sans); color:var(--body); }
  .m-why {
    border-top:1px dashed var(--line2); padding-top:12px;
    font:400 12.5px/1.7 var(--sans); color:var(--muted);
  }
  .m-why b { color:var(--fg); }
  .modal-head {
    display:flex; justify-content:space-between; align-items:center; gap:14px;
    padding:13px 18px; border-bottom:1px solid var(--line);
    font:600 11px var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--fg);
  }
  .modal-body { padding:18px 20px 8px; }
  .modal-body p { font:400 13px/1.8 var(--sans); color:var(--body); margin:0 0 14px; }
  .modal-body p b { color:var(--fg); font-weight:600; }
  .modal-body code { font:400 12px var(--mono); color:var(--amber); }
  .modal-body ul { margin:0 0 14px; padding-left:18px; }
  .modal-body li { font:400 13px/1.8 var(--sans); color:var(--body); }

  /* ── self-host ───────────────────────────────────────────────────────── */
  .sh { display:grid; grid-template-columns:1.1fr .9fr; gap:48px; margin-top:44px; align-items:start; }
  .sh > * { min-width:0; }
  .sh-copy p { color:var(--body); font-size:15.5px; line-height:1.7; margin:0 0 18px; max-width:520px; }
  .sh-copy p b { color:var(--fg); font-weight:600; }
  .sh-spec {
    font:400 11.5px var(--mono); color:var(--faint); letter-spacing:.06em;
    border-top:1px dashed var(--line2); padding-top:14px; margin-top:26px;
  }
  .sh-box { border:1px solid var(--line2); background:var(--bg2); }
  .sh-box-head {
    display:flex; justify-content:space-between; align-items:center; gap:12px;
    padding:10px 16px; border-bottom:1px solid var(--line);
    font:500 11px var(--mono); letter-spacing:.1em; text-transform:uppercase; color:var(--faint);
  }
  .sh-box pre {
    margin:0; padding:18px; font:400 12.5px/1.8 var(--mono); color:var(--body); overflow-x:auto;
  }
  .sh-box pre b { color:var(--amber); font-weight:500; }
  .sh-ctas { display:flex; gap:12px; flex-wrap:wrap; margin-top:20px; }
  .sh-lazy { font:400 12.5px var(--mono); color:var(--faint); margin-top:22px; }

  /* ── footer ──────────────────────────────────────────────────────────── */
  footer {
    border-top:1px solid var(--line); padding-top:40px;
    background-image:radial-gradient(rgba(237,233,222,.045) 1px, transparent 1px);
    background-size:14px 14px;
  }
  .f-grid { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:32px; padding-bottom:40px; }
  .f-note { font:400 12.5px/1.8 var(--mono); color:var(--faint); max-width:300px; margin:0; }
  .f-note b { color:var(--muted); font-weight:500; }
  .f-col h4 { font:600 10.5px var(--mono); letter-spacing:.18em; text-transform:uppercase; color:var(--faint); margin:0 0 14px; }
  .f-col a { display:block; font:400 13px var(--mono); color:var(--muted); padding:4px 0; }
  .f-col a:hover { color:var(--amber); text-decoration:none; }
  .megamark { overflow:hidden; user-select:none; }
  .megamark canvas { display:block; width:100%; height:clamp(96px,12vw,160px); }
  html:not(.js) .megamark canvas { display:none; }
  .mega-fallback {
    font:400 clamp(70px,13.5vw,168px)/.92 var(--pixel); letter-spacing:.02em;
    text-align:center; color:#15130e; transform:translateY(16%);
  }
  .js .mega-fallback { display:none; }

  /* ── status ──────────────────────────────────────────────────────────── */
  .status-hero { padding:84px 0 100px; }
  .status-sub { font:400 12.5px var(--mono); color:var(--faint); margin:4px 0 0; }
  h1.display.status-bad em { color:var(--err); }
  .st-row {
    display:grid; grid-template-columns:14px 170px 1fr 90px 120px;
    gap:16px; align-items:center; padding:16px 20px; border-top:1px solid var(--line);
  }
  .st-row:first-child { border-top:0; }
  .st-dot { width:8px; height:8px; border-radius:50%; }
  .st-dot.on { background:var(--ok); box-shadow:0 0 9px rgba(140,217,140,.7); animation:stpulse 2.4s ease-in-out infinite; }
  .st-dot.err { background:var(--err); box-shadow:0 0 9px rgba(255,107,94,.6); }
  @keyframes stpulse { 0%, 100% { box-shadow:0 0 4px rgba(140,217,140,.3); } 50% { box-shadow:0 0 11px rgba(140,217,140,.85); } }
  .st-name { font:600 12px var(--mono); letter-spacing:.1em; text-transform:uppercase; color:var(--fg); }
  .st-note { font:400 12px var(--mono); color:var(--faint); }
  .st-ms { font:400 12.5px var(--mono); color:var(--muted); text-align:right; }
  .st-state { font:500 11px var(--mono); letter-spacing:.12em; text-transform:uppercase; text-align:right; }
  .st-state.ok { color:var(--ok); } .st-state.bad { color:var(--err); }
  .status-foot { font:400 12.5px var(--mono); color:var(--faint); margin-top:22px; }

  .legal { margin-top:28px; max-width:640px; }
  .legal p { font:400 14px/1.75 var(--sans); color:var(--body); margin:0 0 16px; }
  .legal h3 {
    font:600 11px var(--mono); letter-spacing:.16em; text-transform:uppercase;
    color:var(--amber); margin:30px 0 10px;
  }

  /* ── auth ────────────────────────────────────────────────────────────── */
  .auth-wrap { max-width:340px; margin:13vh auto 80px; padding:0 24px; }
  .auth-logo { display:block; text-align:center; font:400 15px var(--pixel); color:var(--fg); margin-bottom:18px; }
  .auth-logo:hover { text-decoration:none; color:var(--amber); }
  .auth-card { border:1px solid var(--line2); background:var(--bg1); padding:24px 22px 20px; }
  .auth-card label { font-size:10px; margin:14px 0 6px; }
  .auth-card input { padding:10px 12px; font-size:13px; }
  .auth-card .btn.block { padding:10px 14px; font-size:12px; }
  .auth-swap { text-align:center; font:400 11.5px var(--mono); color:var(--muted); margin-top:16px; }
  .auth-terms { text-align:center; font:400 10.5px/1.7 var(--mono); color:var(--faint); margin-top:14px; }
  .auth-terms a { color:var(--muted); }
  .btn.gh { justify-content:center; gap:8px; width:100%; padding:10px 14px; font-size:12px; }
  .btn.gh svg { width:13px; height:13px; fill:currentColor; }
  .or {
    display:flex; align-items:center; gap:12px; margin:16px 0 0;
    font:400 10px var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--faint);
  }
  .or::before, .or::after { content:""; height:1px; flex:1; background:var(--line); }

  /* ── console (product) ───────────────────────────────────────────────── */
  .app-head {
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:20px 0 12px; flex-wrap:wrap;
  }
  .app-head h1 { font:400 18px var(--pixel); margin:0; }
  .pxband { display:flex; gap:4px; align-items:center; }
  .pxband i { width:7px; height:7px; background:var(--amber); opacity:var(--o,.3); }
  .pxband i.bl { animation:pxblink 2.4s steps(1) infinite; animation-delay:var(--bd,0s); }
  @keyframes pxblink { 0%, 62% { opacity:var(--o,.9); } 63%, 100% { opacity:.12; } }
  .chip { font:400 11.5px var(--mono); color:var(--muted); border:1px solid var(--line); background:var(--bg1); padding:5px 10px; }
  .tabs { display:flex; gap:26px; border-bottom:1px solid var(--line); margin-bottom:26px; }
  .tab {
    font:500 12.5px var(--mono); color:var(--muted); padding:0 2px 12px;
    border-bottom:2px solid transparent; margin-bottom:-1px; transition:color .15s;
  }
  .tab:hover { color:var(--fg); text-decoration:none; }
  .tab.active { color:var(--fg); border-color:var(--amber); }
  .back { display:inline-block; font:400 12px var(--mono); color:var(--muted); margin-bottom:16px; }
  .back:hover { color:var(--amber); text-decoration:none; }

  .panel { border:1px solid var(--line); background:var(--bg); margin:0 0 26px; }
  .panel-head {
    display:flex; justify-content:space-between; align-items:center; gap:14px;
    padding:13px 20px; border-bottom:1px solid var(--line); flex-wrap:wrap;
  }
  .panel-head h2 { font:600 12px var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--fg); margin:0; }
  .panel-body { padding:20px; }
  .inline-form { display:flex; gap:10px; margin:0; align-items:center; }
  .inline-form input { width:210px; padding:8px 12px; font-size:12.5px; }

  .krow {
    display:grid; grid-template-columns:14px 1fr 230px 110px 22px; gap:14px;
    align-items:center; padding:15px 18px; border-top:1px solid var(--line);
    font:400 13px var(--mono); color:var(--body); transition:background .15s;
  }
  .krow:first-of-type { border-top:0; }
  .krow:hover { background:var(--bg1); text-decoration:none; }
  .kr-name { color:var(--fg); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .kr-prefix { color:var(--muted); font-size:12.5px; }
  .kr-date { color:var(--faint); font-size:12px; }
  .kr-go { color:var(--faint); transition:color .15s, transform .15s; }
  .krow:hover .kr-go { color:var(--amber); transform:translateX(2px); }
  .krow.revoked .kr-name { color:var(--faint); text-decoration:line-through; }

  .srow {
    display:grid; grid-template-columns:300px 1fr; gap:20px; align-items:center;
    padding:16px 20px; border-top:1px solid var(--line);
  }
  .srow:first-of-type { border-top:0; }
  .s-k { display:block; font:500 12.5px var(--mono); color:var(--fg); }
  .s-d { display:block; font:400 11px/1.6 var(--mono); color:var(--faint); margin-top:3px; max-width:260px; }
  .s-v { font:400 13px var(--mono); color:var(--body); display:flex; align-items:center; gap:12px; flex-wrap:wrap; word-break:break-all; }
  .s-v code { color:var(--fg); }

  .drow {
    display:grid; grid-template-columns:160px 1fr; gap:16px; align-items:center;
    padding:14px 20px; border-top:1px solid var(--line); font:400 13px var(--mono);
  }
  .drow:first-child { border-top:0; }
  .d-k { font:500 10.5px var(--mono); letter-spacing:.16em; text-transform:uppercase; color:var(--faint); }
  .d-v { color:var(--body); word-break:break-all; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .d-v code { color:var(--fg); }

  .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:2px; vertical-align:1px; }
  .dot.on { background:var(--ok); box-shadow:0 0 6px rgba(140,217,140,.6); }
  .dot.off { background:var(--faint); }
  .status-on { color:var(--ok); } .status-off { color:var(--faint); }
  .empty {
    border:1px dashed var(--line2); padding:28px; text-align:center;
    font:400 12.5px var(--mono); color:var(--faint);
  }

  .panel.newkey { border-color:rgba(255,178,36,.5); box-shadow:0 0 50px rgba(255,178,36,.05); }
  .keyrow { display:flex; gap:12px; align-items:stretch; }
  .keycode {
    flex:1; font:500 13.5px var(--mono); color:var(--amber2); background:var(--bg2);
    border:1px dashed var(--line2); padding:14px 16px; word-break:break-all;
  }
  .keynote { font:400 11.5px var(--mono); color:var(--faint); margin:10px 0 0; }

  .flash { font:400 13px var(--mono); padding:12px 16px; border:1px solid; margin:0 0 20px; }
  .flash b { font-weight:600; margin-right:6px; }
  .flash.ok { border-color:rgba(140,217,140,.35); color:var(--ok); background:rgba(140,217,140,.05); }
  .flash.warn { border-color:rgba(255,178,36,.35); color:var(--amber); background:rgba(255,178,36,.05); }
  .flash.err { border-color:rgba(255,107,94,.35); color:var(--err); background:rgba(255,107,94,.06); }

  .muted { color:var(--muted); } .small { font-size:13px; }

  /* ── scroll reveal ───────────────────────────────────────────────────── */
  .js .rev {
    opacity:0; transform:translateY(16px);
    transition:opacity .55s ease, transform .55s cubic-bezier(.2,.7,.2,1);
    transition-delay:var(--rd,0s);
  }
  .js .rev.vis { opacity:1; transform:none; }

  /* ── responsive ──────────────────────────────────────────────────────── */
  @media (max-width:920px) {
    .hero-grid { grid-template-columns:1fr; gap:40px; }
    .stats { grid-template-columns:1fr 1fr; }
    .sh { grid-template-columns:1fr; gap:32px; }
    .f-grid { grid-template-columns:1fr 1fr; }
    .nav-links { display:none; }
    .krow { grid-template-columns:14px 1fr 110px 22px; }
    .kr-prefix { display:none; }
    .st-row { grid-template-columns:14px 1fr 70px 100px; }
    .st-note { display:none; }
  }
  @media (max-width:560px) {
    .stats { grid-template-columns:1fr; }
    .f-grid { grid-template-columns:1fr; }
    .keyrow { flex-direction:column; }
    .panel-head { align-items:flex-start; }
    .krow { grid-template-columns:14px 1fr 22px; }
    .kr-date { display:none; }
    .drow { grid-template-columns:1fr; gap:6px; }
    .srow { grid-template-columns:1fr; gap:8px; }
  }

  @media (prefers-reduced-motion:reduce) {
    *, *::before, *::after { animation:none !important; transition:none !important; }
    .t-line, .t-out, .t-trace, .t-kv { opacity:1; }
    .t-cmd.c1 { width:14ch; } .t-cmd.c2 { width:53ch; } .t-cmd.c3 { width:24ch; }
    .t-bar { transform:none; }
    .js .rev { opacity:1 !important; transform:none !important; }
    .hero-bg .spark { display:none; }
  }
`;

const SCRIPT = `
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var el = document.querySelector(btn.getAttribute("data-copy"));
      if (!el) return;
      navigator.clipboard.writeText(el.innerText.trim()).then(function () {
        btn.classList.add("copied");
        var prev = btn.textContent;
        btn.textContent = "copied";
        setTimeout(function () { btn.classList.remove("copied"); btn.textContent = prev; }, 1500);
      });
    });
  });

  document.querySelectorAll("[data-modal]").forEach(function (b) {
    b.addEventListener("click", function () {
      var d = document.querySelector(b.getAttribute("data-modal"));
      if (d && d.showModal) d.showModal();
    });
  });
  document.querySelectorAll("dialog.modal").forEach(function (d) {
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    d.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { d.close(); });
    });
  });

  document.addEventListener("click", function (e) {
    document.querySelectorAll("details.umenu[open]").forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute("open");
    });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("vis"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".rev").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".rev").forEach(function (el) { el.classList.add("vis"); });
  }

  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // hero grid: stray cells ignite on the 32px lattice
  var heroBg = document.querySelector(".hero-bg");
  if (heroBg && !reduced) {
    var GRID = 16;
    var placeSpark = function (s) {
      var cols = Math.floor(heroBg.clientWidth / GRID);
      var rows = Math.floor((heroBg.clientHeight * 0.82) / GRID);
      s.style.left = Math.floor(Math.random() * cols) * GRID + "px";
      s.style.top = Math.floor(Math.random() * rows) * GRID + "px";
    };
    for (var si = 0; si < 6; si++) {
      var sp = document.createElement("i");
      sp.className = "spark";
      sp.style.setProperty("--sd", (si * 1.28).toFixed(2) + "s");
      placeSpark(sp);
      sp.addEventListener("animationiteration", placeSpark.bind(null, sp));
      heroBg.appendChild(sp);
    }
  }

  // footer: the wordmark as a field of live pixels
  (function () {
    var cv = document.getElementById("mega");
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cells = [], W = 0, H = 0, CS = 8, t = 0, raf = null, running = false;
    var mouse = { x: -1e4, y: -1e4 };

    function build() {
      W = cv.clientWidth; H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      CS = Math.max(5, Math.round(H / 26));
      var cols = Math.ceil(W / CS), rows = Math.ceil(H / CS);
      var off = document.createElement("canvas");
      off.width = cols; off.height = rows;
      var o = off.getContext("2d");
      o.fillStyle = "#fff";
      o.textAlign = "center"; o.textBaseline = "middle";
      o.font = Math.min(rows * 0.95, cols / 4.4) + "px 'Geist Pixel', monospace";
      o.fillText("workdir", cols / 2, rows * 0.58);
      var d = o.getImageData(0, 0, cols, rows).data;
      cells = [];
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          if (d[(y * cols + x) * 4 + 3] > 110) {
            cells.push({ x: x, y: y, ph: Math.random() * 6.283, sp: 0.4 + Math.random() * 1.1 });
          }
        }
      }
    }

    var pulses = [];

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var rows = H / CS;
      var scanY = ((t * 7.5) % (rows + 18)) - 9;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var px = c.x * CS, py = c.y * CS;
        var dx = px - mouse.x, dy = py - mouse.y;
        var prox = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 160);
        var wave = 0.5 + 0.5 * Math.sin(t * 1.1 - c.x * 0.16 - c.y * 0.1);
        var tw = 0.5 + 0.5 * Math.sin(t * c.sp + c.ph);
        var sd = Math.abs(c.y - scanY);
        var scan = sd < 2.2 ? (1 - sd / 2.2) * 0.3 : 0;
        var pb = 0;
        for (var j = 0; j < pulses.length; j++) {
          var age = t - pulses[j].t0;
          var pd = Math.abs(Math.sqrt(Math.pow(px - pulses[j].x, 2) + Math.pow(py - pulses[j].y, 2)) - age * 260);
          if (pd < 30) pb += (1 - pd / 30) * Math.max(0, 1 - age / 1.1) * 0.85;
        }
        var b = 0.07 + wave * 0.09 + tw * 0.05 + scan + pb + prox * prox * 0.95;
        if (b > 1) b = 1;
        ctx.fillStyle = "rgb(" + Math.round(21 + 234 * b) + "," + Math.round(18 + 160 * b) + "," + Math.round(13 + 23 * b) + ")";
        ctx.fillRect(px, py, CS - 1, CS - 1);
      }
    }

    function frame() {
      t += 0.016;
      while (pulses.length && t - pulses[0].t0 > 1.1) pulses.shift();
      draw();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!running && !reduced) { running = true; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    cv.addEventListener("pointerleave", function () { mouse.x = -1e4; mouse.y = -1e4; });
    cv.addEventListener("pointerdown", function (e) {
      var r = cv.getBoundingClientRect();
      if (pulses.length < 6) pulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, t0: t });
    });

    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      build();
      if (reduced) { t = 2.2; draw(); return; }
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
        }).observe(cv);
      } else { start(); }
    });

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { build(); if (reduced) { t = 2.2; draw(); } }, 180);
    });
  })();
`;

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0a0908"/><rect x="5" y="19" width="13" height="7" fill="#ffb224"/><rect x="22" y="19" width="5" height="7" fill="#3a3526"/></svg>`,
  );

// ─────────────────────────────────────────────────────────────────────────────

function layout(
  title: string,
  body: ReturnType<typeof html>,
  opts?: { user?: { email: string }; description?: string; refresh?: number; app?: boolean; bare?: boolean },
) {
  const description =
    opts?.description ??
    "Firecracker microVM sandboxes for AI agents. Hot boots in 38ms, $0.009/hr, billed per second. Open source — self-host with one command.";
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="${description}" />
        <meta name="theme-color" content="#0a0908" />
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        ${opts?.refresh ? html`<meta http-equiv="refresh" content="${opts.refresh}" />` : ""}
        <title>${title}</title>
        <script>
          document.documentElement.classList.add("js");
        </script>
        <link rel="icon" href="${FAVICON}" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
        <style>
          ${raw(STYLES)}
        </style>
      </head>
      <body>
        <div class="rails" aria-hidden="true"></div>
        ${opts?.bare
          ? ""
          : html`<header class="nav ${opts?.app ? "app" : ""}">
          <div class="wrap nav-in">
            <a class="logo" href="/">workdir</a>
            ${opts?.app
              ? html`<nav class="nav-links">
                  <a href="https://github.com/mv37-org/workdir/blob/main/docs/API.md">docs</a>
                </nav>`
              : html`<nav class="nav-links">
                  <a href="https://github.com/mv37-org/workdir/blob/main/docs/API.md">docs</a>
                  <a href="https://github.com/mv37-org/workdir">github</a>
                  <a href="/status">status</a>
                </nav>`}
            <div class="nav-cta">
              ${opts?.user
                ? html`${opts?.app ? "" : html`<a class="btn sm" href="/dashboard">console</a>`}
                    <details class="umenu">
                      <summary aria-label="account menu">⋯</summary>
                      <div class="pop corners">
                        <div class="pop-id">
                          <span class="pop-name">${opts.user.email.split("@")[0]}</span>
                          <span class="pop-mail">${opts.user.email}</span>
                        </div>
                        <form method="post" action="/logout" style="margin:0">
                          <button class="btn sm block" type="submit">log out</button>
                        </form>
                      </div>
                    </details>`
                : html`<a class="btn xs" href="/login">log in</a>
                    <a class="btn xs primary" href="/signup">get api key <span class="ar">→</span></a>`}
            </div>
          </div>
        </header>`}
        ${body}
        ${opts?.app || opts?.bare
          ? ""
          : html`<footer>
              <div class="wrap">
                <div class="f-grid">
                  <div>
                    <p class="f-note">
                      <b>workdir</b> — disposable computers for software that writes software.
                      open source under AGPL-3.0.
                    </p>
                  </div>
                  <div class="f-col">
                    <h4>product</h4>
                    <a href="/signup">get an api key</a>
                    <a href="/dashboard">console</a>
                    <a href="/status">status</a>
                  </div>
                  <div class="f-col">
                    <h4>docs</h4>
                    <a href="https://github.com/mv37-org/workdir/blob/main/docs/API.md">api reference</a>
                    <a href="https://github.com/mv37-org/workdir/blob/main/docs/DEPLOY.md">self-hosting</a>
                    <a href="https://github.com/mv37-org/workdir/blob/main/docs/ARCHITECTURE.md">architecture</a>
                  </div>
                  <div class="f-col">
                    <h4>open source</h4>
                    <a href="https://github.com/mv37-org/workdir">github</a>
                    <a href="https://github.com/mv37-org/workdir/blob/main/LICENSE">license · AGPL-3.0</a>
                    <a href="/terms">terms</a>
                    <a href="/privacy">privacy</a>
                  </div>
                </div>
              </div>
              <div class="megamark" aria-hidden="true">
                <canvas id="mega"></canvas>
                <div class="mega-fallback">workdir</div>
              </div>
            </footer>`}
        <script>
          ${raw(SCRIPT)}
        </script>
      </body>
    </html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing
// ─────────────────────────────────────────────────────────────────────────────

function heroTerminal() {
  return html`<div
    class="term"
    role="img"
    aria-label="Terminal demo: workdir create boots a sandbox via the hot pool in 38 milliseconds, runs a command, and deletes it for $0.00003."
  >
    <div class="term-bar">
      <span class="term-lights">
        <span class="t-dot r"></span><span class="t-dot y"></span><span class="t-dot g"></span>
      </span>
      <span class="term-title">workdir — zsh — 80×24</span>
      <span class="term-host">api.workdir.dev</span>
    </div>
    <div class="term-body" aria-hidden="true">
      <div class="t-line" style="--d:.35s"><span class="t-p">$</span><span class="t-cmd c1" style="--d:.45s">workdir create</span></div>
      <div class="t-out" style="--d:1.05s"><span class="t-arrow">→</span> sandbox <span class="t-em">sb_9f3ka2</span> created</div>
      <div class="t-kv" style="--d:1.2s"><span class="k">boot_path</span><span class="t-em">hot_pool</span></div>
      <div class="t-trace" style="--d:1.34s"><span class="k">queue</span><span class="t-ms">2ms</span><i class="t-bar" style="--w:10px;--d:1.4s"></i></div>
      <div class="t-trace" style="--d:1.46s"><span class="k">assign</span><span class="t-ms">4ms</span><i class="t-bar" style="--w:20px;--d:1.52s"></i></div>
      <div class="t-trace" style="--d:1.58s"><span class="k">kernel</span><span class="t-ms">19ms</span><i class="t-bar" style="--w:95px;--d:1.64s"></i></div>
      <div class="t-trace" style="--d:1.7s"><span class="k">agent</span><span class="t-ms">13ms</span><i class="t-bar" style="--w:65px;--d:1.76s"></i></div>
      <div class="t-kv" style="--d:1.95s"><span class="k">ready</span><span><span class="t-ready">38ms</span><span class="t-dim"> ── total</span></span></div>
      <div class="t-line" style="--d:2.35s"><span class="t-p">$</span><span class="t-cmd c2" style="--d:2.45s">workdir exec sb_9f3ka2 -- echo "hello from a microVM"</span></div>
      <div class="t-out" style="--d:3.6s">hello from a microVM</div>
      <div class="t-line" style="--d:3.95s"><span class="t-p">$</span><span class="t-cmd c3" style="--d:4.05s">workdir delete sb_9f3ka2</span></div>
      <div class="t-out" style="--d:4.75s"><span class="t-arrow">→</span> deleted · ran 11s · billed <span class="t-em">$0.00003</span></div>
      <div class="t-line" style="--d:5s"><span class="t-p">$</span><span class="t-cursor"></span></div>
    </div>
  </div>`;
}

export function landingPage(user?: { email: string }) {
  return layout(
    "workdir — Firecracker sandboxes for AI agents",
    html`
      <section class="hero">
        <div class="hero-bg"></div>
        <div class="wrap">
          <div class="hero-grid">
            <div>
              <div class="hero-tag"><b>$</b> open-source sandboxes for ai agents</div>
              <h1 class="display">Real Linux sandboxes in <em>38 ms</em>.</h1>
              <p class="sub">
                One API to create, exec, and delete Firecracker microVMs. $0.009 an hour for the base
                shape, billed by the second. Self-hosts on any KVM box with one command.
              </p>
              <div class="hero-ctas">
                <a class="btn primary" href="/signup">get an api key <span class="ar">→</span></a>
                <a class="btn" href="https://github.com/mv37-org/workdir">self-host it</a>
              </div>
              <div class="hero-foot">
                npm i @workdir/sdk · pip install workdir ·
                <a href="https://github.com/mv37-org/workdir/blob/main/docs/API.md">or just curl</a>
              </div>
            </div>
            ${heroTerminal()}
          </div>

          <div class="stats corners">
            <div class="stat hot">
              <span>hot boot, p50<button class="supref" data-modal="#m-method" aria-label="how we measure">1</button></span>
              <b>38<small>ms</small></b>
            </div>
            <div class="stat">
              <span>cold boot, p50<button class="supref" data-modal="#m-method" aria-label="how we measure">1</button></span>
              <b>~2<small>s</small></b>
            </div>
            <div class="stat">
              <span>1 vCPU · 2 GB<button class="supref" data-modal="#m-method" aria-label="how we measure">1</button></span>
              <b>$0.009<small>/hr</small></b>
            </div>
            <div class="stat">
              <span>billing<button class="supref" data-modal="#m-method" aria-label="how we measure">1</button></span>
              <b>1<small>s</small></b>
            </div>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="wrap">
          <div class="kicker"><b>//</b> the numbers <span class="kline"></span><span class="kidx">01</span></div>
          <h2 class="h2">Measured, not marketed.</h2>
          <p class="lead">
            Three ways a sandbox comes up. Every create response tells you which one you got, with
            the full timing trace.
          </p>
          <div class="twrap rev">
            <table class="spec">
              <colgroup><col style="width:22%" /><col style="width:15%" /><col style="width:15%" /><col style="width:48%" /></colgroup>
              <thead>
                <tr>
                  <th>boot path</th>
                  <th>p50<button class="supref" data-modal="#m-method" aria-label="how we measure">1</button></th>
                  <th>p95<button class="supref" data-modal="#m-method" aria-label="how we measure">1</button></th>
                  <th>what it is</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>hot_pool</td>
                  <td><b>38 ms</b></td>
                  <td>61 ms</td>
                  <td>warm microVM claimed from the pool — curated images</td>
                </tr>
                <tr>
                  <td>snapshot_restore</td>
                  <td>~210 ms</td>
                  <td>~390 ms</td>
                  <td>memory + disk snapshot restored — custom images, second run on</td>
                </tr>
                <tr>
                  <td>cold_boot</td>
                  <td>~1.9 s</td>
                  <td>~3.4 s</td>
                  <td>fresh rootfs boot — first run of a new image</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="twrap rev" style="margin-top:24px">
            <table class="spec">
              <colgroup><col style="width:22%" /><col style="width:30%" /><col style="width:22%" /><col style="width:26%" /></colgroup>
              <tbody>
                <tr>
                  <td>base shape</td>
                  <td>1 vCPU · 2 GB · 8 GB disk</td>
                  <td><b>$0.009 / hr</b></td>
                  <td><i>≈ $0.0000025 / second</i></td>
                </tr>
                <tr>
                  <td>billing</td>
                  <td>per second</td>
                  <td>no minimum</td>
                  <td><i>meter stops at delete</i></td>
                </tr>
                <tr>
                  <td>bigger shapes</td>
                  <td>linear in resources</td>
                  <td>2× memory ≈ 2× price</td>
                  <td><i>quote returned on every create</i></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="tnote">
            don't trust this table — every create returns its own <code>boot_path</code>,
            <code>timings_ms</code>, and price quote. trust those.
            <button class="srclink" data-modal="#m-method" type="button">¹ how we measure →</button>
          </p>
        </div>
      </section>

      <section class="block">
        <div class="wrap">
          <div class="kicker"><b>//</b> the field <span class="kline"></span><span class="kidx">02</span></div>
          <h2 class="h2">Versus the other sandboxes.</h2>
          <p class="lead">
            Their published numbers, their marketing's best case, rounded in their favor.
          </p>
          <div class="twrap rev">
            <table class="spec cmp">
              <colgroup><col style="width:18%" /><col style="width:23%" /><col style="width:20%" /><col style="width:19%" /><col style="width:20%" /></colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th class="wd">workdir</th>
                  <th>e2b</th>
                  <th>modal</th>
                  <th>fly machines</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>isolation</td>
                  <td class="wd">firecracker microVM</td>
                  <td>firecracker microVM</td>
                  <td>gVisor container</td>
                  <td>firecracker microVM</td>
                </tr>
                <tr>
                  <td>create → ready</td>
                  <td class="wd"><b>38 ms</b> hot · ~2 s cold</td>
                  <td>~150 ms</td>
                  <td>~1 s</td>
                  <td>~300 ms</td>
                </tr>
                <tr>
                  <td>1 vCPU · 2 GB</td>
                  <td class="wd"><b>$0.009 / hr</b></td>
                  <td>~$0.13 / hr</td>
                  <td>~$0.15 / hr</td>
                  <td>~$0.015 / hr</td>
                </tr>
                <tr>
                  <td>boot path disclosed</td>
                  <td class="wd">every create</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>self-host</td>
                  <td class="wd">one command</td>
                  <td>diy cluster</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>open source</td>
                  <td class="wd">AGPL-3.0, all of it</td>
                  <td>infra only</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="tnote">
            mid-2026 list prices for the closest comparable shape; latencies as advertised by each.
            spot an error? <a href="https://github.com/mv37-org/workdir/issues">open an issue</a> and
            we'll fix the table.
            <button class="srclink" data-modal="#m-sources" type="button">² sources →</button>
          </p>
        </div>
      </section>

      <section class="block">
        <div class="wrap">
          <div class="kicker"><b>//</b> self-host <span class="kline"></span><span class="kidx">03</span></div>
          <h2 class="h2">We'd rather you self-host.</h2>
          <div class="sh">
            <div class="sh-copy">
              <p>
                One command on a KVM box turns it into a sandbox fleet — the same binary our cloud
                runs, scheduler, billing, and preview proxy included.
              </p>
              <p>
                <b>Your agents, on your metal.</b> You can read every line of the thing they execute
                on, cap their network, and add capacity by plugging in another server. No quotas, no
                noisy neighbors, no usage report you can't audit.
              </p>
              <p>
                The hosted cloud at workdir.dev exists for the impatient — same code, same prices,
                zero setup. It's a convenience, not a moat.
              </p>
              <div class="sh-spec">agpl-3.0 · single binary · no phone-home · gpu shapes next release</div>
            </div>
            <div>
              <div class="sh-box corners">
                <div class="sh-box-head">
                  <span>ubuntu 24.04 / debian 12 · kvm required</span>
                  <button class="copy" data-copy="#install" type="button">copy</button>
                </div>
                <pre id="install"><b>curl</b> -fsSL https://workdir.dev/install.sh | sudo bash</pre>
              </div>
              <div class="sh-ctas">
                <a class="btn" href="https://github.com/mv37-org/workdir/blob/main/docs/DEPLOY.md">deploy guide</a>
                <a class="btn" href="https://github.com/mv37-org/workdir">github</a>
              </div>
              <p class="sh-lazy">
                impatient? <a href="/signup">take a hosted key →</a> first sandbox in under a minute.
              </p>
            </div>
          </div>
        </div>
      </section>

      <dialog class="modal corners" id="m-method">
        <div class="modal-head">
          <span>¹ every number, and how it's measured</span>
          <button class="copy" data-close type="button">close</button>
        </div>
        <div class="modal-body">
          <p>
            All latencies are timed server-side, from the API admitting your create to the in-guest
            agent reporting ready — the exact span returned as <code>timings_ms</code> on every
            create. Percentiles are trailing 30 days on the public fleet, split per path.
          </p>
          <table class="mtab">
            <tr>
              <td>hot_pool</td>
              <td>claim a pre-booted microVM from the warm pool: queue → assign → handshake. Live fleet percentiles.</td>
            </tr>
            <tr>
              <td>snapshot_restore</td>
              <td>restore a memory + disk snapshot, resume the VM, handshake. <code>~</code> = staging projection until public traffic gives us honest trailing data.</td>
            </tr>
            <tr>
              <td>cold_boot</td>
              <td>copy the rootfs, boot the kernel fresh, start the agent, handshake. <code>~</code> = staging projection, same caveat.</td>
            </tr>
            <tr>
              <td>$0.009 / hr</td>
              <td>the at-cost unit price in <a href="https://github.com/mv37-org/workdir/blob/main/crates/sandboxd/src/pricing.rs">pricing.rs</a> × the resources you ask for. The exact quote rides on every create response.</td>
            </tr>
            <tr>
              <td>1 s billing</td>
              <td>the meter runs from create to delete and rounds to the second. No minimum, no idle charge after delete.</td>
            </tr>
          </table>
          <p class="m-why">
            <b>Why we split it three ways:</b> most providers quote their warmest path and call it
            "starts at". We won't. 38 ms is the hot pool — cold is ~2 s, and the table says so.
            Every create tells you which one you got.
          </p>
        </div>
      </dialog>

      <dialog class="modal corners" id="m-sources">
        <div class="modal-head">
          <span>² comparison sources</span>
          <button class="copy" data-close type="button">close</button>
        </div>
        <div class="modal-body">
          <p>
            Retrieved June 2026, normalized to the closest shape to 1 vCPU · 2 GB each provider
            sells, rounded in their favor. Latencies are the headline figures from their own docs —
            we did not benchmark competitors ourselves.
          </p>
          <ul>
            <li><a href="https://e2b.dev/pricing" rel="noopener">e2b.dev/pricing</a> — per-vCPU + per-GB usage rates</li>
            <li><a href="https://modal.com/pricing" rel="noopener">modal.com/pricing</a> — per-core + per-GB-second rates</li>
            <li><a href="https://fly.io/docs/about/pricing/" rel="noopener">fly.io pricing</a> — shared-cpu-1x machine, 2 GB</li>
          </ul>
          <p>
            Pricing pages move. If a number here is stale,
            <a href="https://github.com/mv37-org/workdir/issues">open an issue</a> — the table gets
            fixed, not defended.
          </p>
        </div>
      </dialog>
    `,
    { user },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusCheck {
  name: string;
  ok: boolean;
  ms: number | null;
  note: string;
}

export function statusPage(opts: { checks: StatusCheck[]; at: string }) {
  const allOk = opts.checks.every((c) => c.ok);
  return layout(
    "Status — workdir",
    html`
      <section class="status-hero">
        <div class="wrap">
          <div class="kicker"><b>//</b> status <span class="kline"></span><span class="kidx">live</span></div>
          <h1 class="display ${allOk ? "" : "status-bad"}">
            ${allOk ? html`All systems <em>operational</em>.` : html`Something's <em>not answering</em>.`}
          </h1>
          <p class="status-sub">
            checks run as this page rendered · ${opts.at} utc · refreshes every 30s
          </p>
          <div class="panel" style="margin-top:36px">
            ${opts.checks.map(
              (ch) => html`<div class="st-row">
                <span class="st-dot ${ch.ok ? "on" : "err"}"></span>
                <span class="st-name">${ch.name}</span>
                <span class="st-note">${ch.note}</span>
                <span class="st-ms">${ch.ms === null ? "—" : `${ch.ms}ms`}</span>
                <span class="st-state ${ch.ok ? "ok" : "bad"}">${ch.ok ? "operational" : "unreachable"}</span>
              </div>`,
            )}
          </div>
          <p class="status-foot">
            something look wrong?
            <a href="https://github.com/mv37-org/workdir/issues">open an issue</a>
          </p>
        </div>
      </section>
    `,
    {
      description: "Live status of workdir.dev — control panel, accounts database, and sandbox API.",
      refresh: 30,
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export function authPage(mode: "login" | "signup", error?: string) {
  const isSignup = mode === "signup";
  return layout(
    isSignup ? "Sign up — workdir" : "Log in — workdir",
    html`
      <div class="auth-wrap">
        <a class="auth-logo" href="/">workdir</a>
        <form class="auth-card corners" method="post" action="${isSignup ? "/signup" : "/login"}">
          ${error ? html`<div class="flash err"><b>err:</b>${error}</div>` : ""}
          <a class="btn gh" href="/auth/github">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
            continue with github
          </a>
          <div class="or"><span>or</span></div>
          <label for="email">email</label>
          <input id="email" name="email" type="email" placeholder="you@company.com" required autofocus />
          <label for="password">password</label>
          <input id="password" name="password" type="password" placeholder="${isSignup ? "8+ characters" : "••••••••"}" required minlength="8" />
          <div style="margin-top:20px">
            <button class="btn primary block" type="submit">${isSignup ? html`create account <span class="ar">→</span>` : html`log in <span class="ar">→</span>`}</button>
          </div>
        </form>
        <p class="auth-swap">
          ${isSignup
            ? html`already have an account? <a href="/login">log in</a>`
            : html`need an account? <a href="/signup">sign up</a>`}
        </p>
        <p class="auth-terms">
          by continuing you agree to the<br />
          <a href="/terms">terms of service</a> · <a href="/privacy">privacy policy</a>
        </p>
      </div>
    `,
    { bare: true },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Console (product)
// ─────────────────────────────────────────────────────────────────────────────

function consoleShell(
  user: { email: string },
  active: "keys" | "settings",
  body: ReturnType<typeof html>,
) {
  return html`
    <div class="wrap">
      <div class="app-head">
        <h1>console</h1>
        <div class="pxband" aria-hidden="true">
          <i style="--o:.15"></i><i style="--o:.25"></i><i style="--o:.2"></i><i style="--o:.45"></i>
          <i style="--o:.3"></i><i class="bl" style="--o:.9"></i><i style="--o:.5"></i><i style="--o:.25"></i>
          <i class="bl" style="--o:.7;--bd:1.1s"></i><i style="--o:.35"></i><i style="--o:.2"></i><i style="--o:.12"></i>
        </div>
      </div>
      <div class="tabs">
        <a class="tab ${active === "keys" ? "active" : ""}" href="/dashboard">api keys</a>
        <a class="tab ${active === "settings" ? "active" : ""}" href="/dashboard/settings">settings</a>
      </div>
      ${body}
    </div>
  `;
}

export function dashboardPage(opts: {
  user: { email: string };
  keys: ApiKeyRow[];
  newKey?: string;
  flash?: { kind: "ok" | "warn" | "err"; msg: string };
}) {
  const { user, keys, newKey, flash } = opts;
  const activeKeys = keys.filter((k) => !k.revoked).length;

  return layout(
    "API keys — workdir",
    consoleShell(
      user,
      "keys",
      html`
        ${flash ? html`<div class="flash ${flash.kind}"><b>${flash.kind}:</b>${flash.msg}</div>` : ""}
        ${newKey
          ? html`<div class="panel newkey corners">
              <div class="panel-head"><h2>new api key — copy it now</h2></div>
              <div class="panel-body">
                <div class="keyrow">
                  <div class="keycode" id="newkey">${newKey}</div>
                  <button class="copy" data-copy="#newkey" type="button">copy</button>
                </div>
                <p class="keynote">shown once — we store only the SHA-256 hash.</p>
              </div>
            </div>`
          : ""}
        <div class="panel">
          <div class="panel-head">
            <h2>api keys · ${activeKeys} active</h2>
            <form method="post" action="/dashboard/keys" class="inline-form">
              <input type="text" name="name" placeholder="key name, e.g. prod" />
              <button class="btn sm primary" type="submit">create key</button>
            </form>
          </div>
          ${keys.length === 0
            ? html`<div class="panel-body">
                <div class="empty">no keys yet — create one to start calling the API</div>
              </div>`
            : keys.map(
                (k) => html`<a class="krow ${k.revoked ? "revoked" : ""}" href="/dashboard/keys/${k.id}">
                  <span class="dot ${k.revoked ? "off" : "on"}"></span>
                  <span class="kr-name">${k.name ?? "unnamed"}</span>
                  <code class="kr-prefix">${k.prefix}…</code>
                  <span class="kr-date">${k.created_at.slice(0, 10)}</span>
                  <span class="kr-go">→</span>
                </a>`,
              )}
        </div>
      `,
    ),
    { user, app: true },
  );
}

export function keyDetailPage(opts: { user: { email: string }; key: ApiKeyRow }) {
  const { user, key } = opts;
  return layout(
    `${key.name ?? "key"} — workdir`,
    consoleShell(
      user,
      "keys",
      html`
        <a class="back" href="/dashboard">← all keys</a>
        <div class="panel">
          <div class="panel-head">
            <h2>${key.name ?? "unnamed"}</h2>
            ${key.revoked
              ? html`<span class="status-off"><span class="dot off"></span>revoked</span>`
              : html`<form method="post" action="/dashboard/keys/${key.id}/revoke" style="margin:0">
                  <button class="btn sm danger" type="submit">revoke key</button>
                </form>`}
          </div>
          <div class="drow">
            <span class="d-k">status</span>
            <span class="d-v">
              ${key.revoked
                ? html`<span class="status-off"><span class="dot off"></span> revoked</span>`
                : html`<span class="status-on"><span class="dot on"></span> active</span>`}
            </span>
          </div>
          <div class="drow">
            <span class="d-k">key</span>
            <span class="d-v"><code>${key.prefix}…</code> <i class="muted small">full key shown once at creation</i></span>
          </div>
          <div class="drow">
            <span class="d-k">created</span>
            <span class="d-v">${key.created_at.slice(0, 19).replace("T", " ")} utc</span>
          </div>
          <div class="drow">
            <span class="d-k">last used</span>
            <span class="d-v">${key.last_used_at ? key.last_used_at.slice(0, 19).replace("T", " ") + " utc" : "never"}</span>
          </div>
        </div>
      `,
    ),
    { user, app: true },
  );
}

export function settingsPage(opts: {
  user: { email: string };
  orgId: string;
  balance?: number;
  method: string;
}) {
  const { user, orgId, balance, method } = opts;
  return layout(
    "Settings — workdir",
    consoleShell(
      user,
      "settings",
      html`
        <div class="panel">
          <div class="panel-head"><h2>account</h2></div>
          <div class="srow">
            <div>
              <span class="s-k">email</span>
              <span class="s-d">how you sign in; key alerts and receipts land here</span>
            </div>
            <span class="s-v">${user.email}</span>
          </div>
          <div class="srow">
            <div>
              <span class="s-k">sign-in method</span>
              <span class="s-d">how this account authenticates</span>
            </div>
            <span class="s-v">${method}</span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>organization</h2></div>
          <div class="srow">
            <div>
              <span class="s-k">org id</span>
              <span class="s-d">scopes your keys, sandboxes, and billing on the sandbox API</span>
            </div>
            <span class="s-v">
              <code id="orgid">${orgId}</code>
              <button class="copy" data-copy="#orgid" type="button">copy</button>
            </span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>billing</h2></div>
          <div class="srow">
            <div>
              <span class="s-k">credit balance</span>
              <span class="s-d">prepaid credits, metered per second while sandboxes run</span>
            </div>
            <span class="s-v">${balance !== undefined ? `$${balance.toFixed(2)}` : html`<span class="muted">— daemon unreachable</span>`}</span>
          </div>
        </div>
      `,
    ),
    { user, app: true },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legal
// ─────────────────────────────────────────────────────────────────────────────

function legalPage(title: string, kicker: string, body: ReturnType<typeof html>) {
  return layout(
    `${title} — workdir`,
    html`
      <section class="status-hero">
        <div class="wrap" style="max-width:760px">
          <div class="kicker"><b>//</b> ${kicker} <span class="kline"></span><span class="kidx">legal</span></div>
          <h1 class="display" style="font-size:clamp(22px,3vw,30px)">${title}</h1>
          <div class="legal">${body}</div>
        </div>
      </section>
    `,
    { description: `workdir ${title.toLowerCase()}` },
  );
}

export function termsPage() {
  return legalPage(
    "Terms of service",
    "terms",
    html`
      <p>Effective June 2026. Short version: use the sandboxes, don't use them to hurt people.</p>
      <h3>the service</h3>
      <p>
        workdir.dev provides ephemeral Linux microVMs over an API, billed per second against prepaid
        credits. The software is open source (AGPL-3.0); these terms cover the hosted service only.
      </p>
      <h3>acceptable use</h3>
      <p>
        No illegal content or activity, no attacking third parties (DDoS, unauthorized scanning,
        credential stuffing), no crypto mining, no spam infrastructure, no attempting to escape the
        sandbox or access other tenants. We suspend first and ask questions second when abuse puts
        the fleet or other customers at risk.
      </p>
      <h3>your data</h3>
      <p>
        Sandboxes are ephemeral: their disks are destroyed at delete. You own what you run and its
        outputs. We never train on, sell, or inspect your workloads except as needed to operate the
        service or as required by law.
      </p>
      <h3>billing</h3>
      <p>
        Per-second metering against prepaid credits; the price quote is attached to every create
        response. Unused credits are refundable on request within 90 days of purchase.
      </p>
      <h3>availability & liability</h3>
      <p>
        The service is provided as-is, without warranty. Our total liability is capped at the amount
        you paid us in the preceding 3 months. Run your own server if you need guarantees we can't
        make — we'll help you do it.
      </p>
      <h3>changes & termination</h3>
      <p>
        You can leave any time; your keys revoke instantly and remaining sandboxes are destroyed. We
        may update these terms with 14 days' notice to your account email.
      </p>
    `,
  );
}

export function privacyPage() {
  return legalPage(
    "Privacy policy",
    "privacy",
    html`
      <p>Effective June 2026. Short version: we store almost nothing, and we sell none of it.</p>
      <h3>what we store</h3>
      <p>
        Your email, a PBKDF2 hash of your password (or a GitHub marker if you signed in with
        GitHub — we never see your GitHub password), SHA-256 hashes of your API keys (never the
        keys), session tokens (hashed), and usage metadata: sandbox counts, durations, and billing
        totals. Sandbox contents are not inspected and are destroyed at delete.
      </p>
      <h3>cookies</h3>
      <p>
        One session cookie, HttpOnly and same-site, used only to keep you logged in. No analytics
        cookies, no trackers, no fingerprinting.
      </p>
      <h3>third parties</h3>
      <p>
        Cloudflare serves this site and proxies the API. Hetzner provides the physical servers. If
        you sign in with GitHub, GitHub tells us your verified email address. That's the list — no
        ad networks, no data brokers.
      </p>
      <h3>deletion</h3>
      <p>
        Email us from your account address and we delete the account, org, and key hashes within 30
        days; billing records are retained as required by tax law.
      </p>
    `,
  );
}
