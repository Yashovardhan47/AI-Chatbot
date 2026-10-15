import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Brain, Check, FileText, Inbox, MessageSquare, Pause, Play, Quote } from "lucide-react";
const chapters = [
  { icon: MessageSquare, label: "Say it naturally", title: "Start with your own words.", detail: "A preference, a project decision, an idea worth keeping. Context starts in a real conversation." },
  { icon: Quote, label: "Keep the evidence", title: "A fact should have a source.", detail: "Inspect the exact quotation and the observation behind a proposed memory." },
  { icon: Inbox, label: "Make the decision", title: "Choose what carries forward.", detail: "When review is enabled, proposed facts wait for your approval before they enter recall." },
  { icon: Brain, label: "Pick up the thread", title: "Come back with context.", detail: "Relevant, eligible memories can support your next conversation, with a receipt you can inspect." },
];
export default function MemoryStory() {
  const [chapter, setChapter] = useState(0), [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setChapter(current => Math.min(current + 1, chapters.length - 1)), 5000);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => { if (chapter === chapters.length - 1) setPlaying(false); }, [chapter]);
  function select(index) { setChapter(index); setPlaying(false); }
  return <div className="nx-memory-story"><div className="nx-story-chapters"><span className="nx-kicker">A MEMORY, FROM START TO NEXT TIME</span>
    {chapters.map(({ icon: Icon, label, title, detail }, index) => <button key={label} className={chapter === index ? "active" : ""} aria-pressed={chapter === index} onClick={() => select(index)}><span className="nx-chapter-number">0{index + 1}</span><div><strong>{label}</strong>{chapter === index && <><h3>{title}</h3><p>{detail}</p></>}</div><Icon size={17} /></button>)}
  </div><div className="nx-story-stage"><div className="nx-story-toolbar"><span><i />MEMORY IN MOTION</span><small>Interactive illustration · example data</small></div>
    <div className="nx-story-example" key={chapter} aria-live="polite">
      {chapter === 0 && <><span className="nx-stage-number">01 / A CONVERSATION</span><div className="nx-example-user"><span>A</span><p>“We switched the backend to FastAPI for async support.”</p></div><div className="nx-example-ai"><span className="nx-story-avatar"><Brain size={18} /></span><div><strong>A decision worth carrying forward.</strong><p>A grounded fact can be proposed from the words you just shared.</p></div></div><div className="nx-stage-footnote"><MessageSquare size={14} />Context begins with something you actually said.</div></>}
      {chapter === 1 && <><span className="nx-stage-number">02 / AN INSPECTABLE SOURCE</span><div className="nx-evidence-sheet"><div><FileText size={16} /><span>PROPOSED MEMORY</span><small>Project context</small></div><h3>Backend framework: FastAPI</h3><blockquote>“We switched the backend to FastAPI for async support.”</blockquote><footer><Quote size={13} />Original user quotation</footer></div><div className="nx-stage-footnote">Source and scope stay attached to the fact.</div></>}
      {chapter === 2 && <><span className="nx-stage-number">03 / YOUR MEMORY INBOX</span><div className="nx-example-inbox"><span><Inbox size={20} />Ready for your review</span><h3>Keep this decision?</h3><p>Backend framework: FastAPI</p><blockquote>“We switched the backend to FastAPI for async support.”</blockquote><button onClick={() => select(3)}><Check size={15} />Approve example<ArrowRight size={14} /></button><small>Illustration only. No account data is changed.</small></div></>}
      {chapter === 3 && <><span className="nx-stage-number">04 / A LATER CONVERSATION</span><div className="nx-example-question">Which backend framework did we settle on?</div><div className="nx-example-recall"><Brain size={21} /><p>The current decision is <strong>FastAPI</strong>, chosen for async support.</p><span><Check size={12} />Memory used · source available · example</span></div><div className="nx-stage-footnote">You can inspect, correct or delete what was remembered.</div></>}
    </div>
    <footer className="nx-story-controls"><div>{chapters.map((item, index) => <button key={item.label} className={chapter === index ? "active" : ""} aria-label={`Show step ${index + 1}`} onClick={() => select(index)} />)}</div><span>0{chapter + 1} / 04</span><button aria-label="Previous step" disabled={chapter === 0} onClick={() => select(chapter - 1)}><ArrowLeft size={16} /></button><button aria-label={playing ? "Pause walkthrough" : "Play walkthrough"} onClick={() => { if (chapter === 3) setChapter(0); setPlaying(value => !value); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button aria-label="Next step" disabled={chapter === 3} onClick={() => select(chapter + 1)}><ArrowRight size={16} /></button></footer>
  </div></div>;
}
