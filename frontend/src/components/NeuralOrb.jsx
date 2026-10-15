import { useId } from "react";
import { Brain, BookOpen, Check } from "lucide-react";

export default function NeuralOrb({ compact = false }) {
  const uid = useId().replace(/:/g, "");
  const nodes = Array.from({ length: 16 }, (_, index) => {
    const angle = index * 2.39996, radius = 42 + index * 7;
    return [240 + Math.cos(angle) * radius, 240 + Math.sin(angle) * radius * .8];
  });
  return <div className={`nx-orb-scene ${compact ? "compact" : ""}`}>
    <div className="nx-orb-halo" />
    <svg className="nx-orb" viewBox="0 0 480 480" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-sphere`} cx="36%" cy="25%" r="76%"><stop stopColor="#d9cdff" /><stop offset=".32" stopColor="#a18af0" /><stop offset=".7" stopColor="#6550b2" /><stop offset="1" stopColor="#302445" /></radialGradient>
        <radialGradient id={`${uid}-shine`} cx="30%" cy="18%"><stop stopColor="#fff" stopOpacity=".4" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <clipPath id={`${uid}-clip`}><circle cx="240" cy="240" r="166" /></clipPath>
      </defs>
      <ellipse cx="240" cy="258" rx="227" ry="81" fill="none" stroke="#d0c3f7" strokeOpacity=".14" transform="rotate(-24 240 240)" />
      <ellipse cx="240" cy="240" rx="214" ry="106" fill="none" stroke="#c4b5f3" strokeOpacity=".2" transform="rotate(35 240 240)" />
      <circle cx="240" cy="240" r="166" fill={`url(#${uid}-sphere)`} />
      <g clipPath={`url(#${uid}-clip)`} fill="none" stroke="#e4d9ff" strokeOpacity=".25" strokeWidth=".7">
        {[25, 65, 105, 140].map(radius => <ellipse key={radius} cx="240" cy="240" rx={radius} ry="166" transform="rotate(-22 240 240)" />)}
        {[-116, -74, -26, 26, 74, 116].map(offset => <ellipse key={offset} cx="240" cy={240 + offset} rx={Math.sqrt(166 ** 2 - offset ** 2)} ry="25" transform="rotate(-22 240 240)" />)}
        {nodes.map(([x, y], index) => <path key={index} d={`M${x},${y}L${nodes[(index + 3) % nodes.length].join(",")}L${nodes[(index + 7) % nodes.length].join(",")}`} strokeOpacity=".26" />)}
      </g>
      <circle cx="240" cy="240" r="166" fill={`url(#${uid}-shine)`} />
      {nodes.map(([x, y], index) => <g key={index}><circle cx={x} cy={y} r={index % 3 ? "2" : "4"} fill={index % 3 ? "#f3ecff" : "#e3f4ab"} /><circle cx={x} cy={y} r="9" fill="none" stroke="#eee6ff" strokeOpacity={index % 3 ? ".08" : ".26"} /></g>)}
      <circle cx="240" cy="240" r="167" fill="none" stroke="#e4d8ff" strokeOpacity=".35" />
    </svg>
    {!compact && <><div className="nx-orbit-label"><i />A CONNECTED THREAD</div>
      <div className="nx-orb-note nx-orb-note-one"><span><Brain size={15} />Remembered context<small>EXAMPLE</small></span><strong>Python + FastAPI.</strong><p>A decision with a source you can trace.</p><div><Check size={12} />Version 2 · current</div></div>
      <div className="nx-orb-note nx-orb-note-two"><BookOpen size={17} /><span>Research design brief<small>Project knowledge · example</small></span><span className="nx-note-arrow">↗</span></div>
      <div className="nx-orb-caption"><span>01 — CONVERSATION</span><i /><span>02 — CONTEXT</span><i /><span>03 — CONTINUITY</span></div>
    </>}
  </div>;
}
