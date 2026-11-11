export const STYLE = `
:host{all:initial}
*{box-sizing:border-box}

/* Base Blueprint Canvas */
.bg{position:absolute;inset:0;opacity:0;transition:opacity .4s ease;background-color:#0B192C}
.bg.on{opacity:1}

/* Engineering CAD Grid Overlay */
.cad-grid{position:absolute;inset:0;pointer-events:none;background-size:24px 24px;background-image:linear-gradient(to right,rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.04) 1px,transparent 1px);opacity:.85}
.pulse-band{position:absolute;left:0;right:0;top:0;height:2px;opacity:0;pointer-events:none;background:#38BDF8;box-shadow:0 0 18px 4px rgba(56,189,248,.42);transition:transform .28s ease,opacity .3s ease;z-index:3}

.layer,.port{position:absolute;overflow:hidden;pointer-events:none}
.layer{inset:0}
.world{position:absolute;left:0;top:0;will-change:transform}
.it{position:absolute;left:0;top:0;transform-origin:0 0}
.it.settle{transition:transform .24s cubic-bezier(.16,1,.3,1)}

/* Constructed Elements - Architectural Drafting Style */
.r{background-color:var(--ph,#1E293B);border:1px solid rgba(255,255,255,.1);transition:background-color .2s ease,border-color .2s ease}
.r.st{background-color:transparent;border-color:transparent}
.r>.f{position:absolute;inset:0;opacity:0;transition:opacity .2s ease,background-color .25s ease,box-shadow .25s ease,border-color .25s ease}
.r.st>.f{opacity:1}

/* Media Blocks */
.m{background-color:var(--ph,#1E293B);overflow:hidden;border:1px solid rgba(255,255,255,.12)}
.m>.ph{position:absolute;left:50%;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);opacity:.6;transition:opacity .2s}
.m>.md{position:absolute;inset:0;width:100%;height:100%;opacity:0;clip-path:inset(0 0 100% 0);transition:opacity .3s ease,clip-path .5s cubic-bezier(.2,.8,.2,1)}
.m.st{background-color:transparent;border-color:transparent;transition:background-color .25s ease}
.m.st>.ph{opacity:0}
.m.st>.md{opacity:1;clip-path:inset(0 0 0 0)}
.m>.fr{position:absolute;inset:0;pointer-events:none}

.l svg{position:absolute;left:0;top:0;overflow:visible}
.bd{position:absolute;opacity:0;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);pointer-events:none}

/* Technical Block Caret */
.caret{display:inline-block;width:2px;height:1em;margin-left:1px;margin-right:-2px;vertical-align:text-bottom;background:currentColor;animation:blink .8s steps(1) infinite}
@keyframes blink{50%{opacity:0}}

.ov{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.badges,.cursors{position:absolute;inset:0;pointer-events:none;overflow:hidden}

/* Technical Role Badges */
.badge{position:absolute;transform:translate(-50%);padding:1px 5px;background:#0F172A;border:1px solid rgba(255,255,255,.2);color:#E2E8F0;font:600 10px/14px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.02em;white-space:nowrap;font-variant-numeric:tabular-nums}
.cursor{position:absolute;left:0;top:0;width:8px;height:8px;border:1px solid currentColor;border-radius:50%;will-change:transform;opacity:.85}
.cursor svg{position:absolute;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.sf-inspect-box{position:fixed;pointer-events:none;border:1px solid #38BDF8;background:rgba(56,189,248,.12);z-index:9998}
.sf-inspect-box[hidden]{display:none}

/* Technical Rulers */
.rulers{position:absolute;inset:0;pointer-events:none}
.ruler{position:absolute;background:#0F172A;pointer-events:none}
.ruler svg{display:block}
.ruler-top{top:0;left:0;right:0;height:20px;border-bottom:1px solid #1E293B}
.ruler-left{top:0;left:0;bottom:0;width:20px;border-right:1px solid #1E293B}
.ruler-corner{position:absolute;top:0;left:0;width:20px;height:20px;background:#0F172A;border-right:1px solid #1E293B;border-bottom:1px solid #1E293B}
.rtext{font:500 9px ui-monospace,monospace;fill:#94A3B8}
.rsel{fill:#0284C7}

/* Intro Overlay */
.intro{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity .3s ease;pointer-events:none}
.intro.on{opacity:1}
.intro.gone{opacity:0}
.intro .logo-box{padding:12px 20px;background:#0F172A;border:1px solid #334155;color:#E2E8F0;font:700 13px/1.2 ui-monospace,monospace;letter-spacing:.08em;text-align:center}

/* Technical HUD Control Surface */
.hud{position:absolute;left:50%;bottom:20px;transform:translate(-50%,12px);opacity:0;display:flex;align-items:center;gap:8px;padding:6px 10px;max-width:calc(100vw - 16px);overflow:hidden;background:#0F172A;border:1px solid #334155;color:#E2E8F0;font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.02em;pointer-events:auto;transition:opacity .3s ease,transform .3s ease;white-space:nowrap;user-select:none;z-index:9999}
.hud.on{opacity:1;transform:translate(-50%,0)}
.hud .title-tag{color:#94A3B8;font-weight:700;margin-right:2px}
.hud .dots{display:flex;gap:3px;align-items:center}
.hud .dots i{display:block;width:6px;height:6px;border-radius:1px;background:#38BDF8}
.hud .txt,.hud .status{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;color:#94A3B8;font-variant-numeric:tabular-nums}
.hud .txt b{color:#F8FAFC;font-weight:700}
.sr-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.hud .sep{width:1px;height:12px;background:#334155}
.hud .bar{width:56px;height:3px;background:#1E293B;overflow:hidden}
.hud .bar i{display:block;height:100%;width:0;background:#38BDF8;transition:width .2s ease}

/* Buttons */
.hud button{all:unset;cursor:pointer;padding:5px 8px;background:#1E293B;border:1px solid #334155;color:#E2E8F0;font:600 10px/1 ui-monospace,monospace;transition:background .12s,border-color .12s}
.hud button:focus-visible,.sf-inspector-badge:focus-visible{outline:2px solid #38BDF8;outline-offset:2px}
.sa{background:rgba(56,189,248,.28)}
.hud button:hover{background:#334155;border-color:#475569}
.hud button.pri{background:#0284C7;border-color:#0369A1;color:#FFFFFF}
.hud button.pri:hover{background:#0369A1}
.hud button.on{background:#0284C7;border-color:#38BDF8;color:#FFFFFF}
.hud button[hidden]{display:none}
.hud .x{padding:5px 7px;color:#94A3B8}

/* Inspector Floating Tooltip */
.sf-inspector-badge{all:unset;position:fixed;background:#0F172A;border:1px solid #38BDF8;color:#FFFFFF;padding:4px 8px;font:600 10px/1.2 ui-monospace,monospace;z-index:10000;pointer-events:auto;cursor:pointer}
.sf-inspector-badge:hover{background:#0284C7}
.sf-inspector-badge[hidden]{display:none}
@media (prefers-reduced-motion:reduce){
  :host{transition:none!important}
  .bg,.hud,.pulse-band,.intro,.it.settle,.r,.m>.md,.caret{transition:none!important;animation:none!important}
}
@media (max-width:480px){
  .hud{gap:5px;padding:5px 6px}
  .hud .title-tag,.hud .dots,.hud .bar{display:none}
  .hud .txt{flex:1;min-width:0}
}
`;
