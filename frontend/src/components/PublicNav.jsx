import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "./AppShell";
import useAuthStore from "../context/authStore";
import MotionControl from "../motion/MotionControl";
export default function PublicNav({ onSection, dark = false }) {
  const user = useAuthStore(state => state.user);
  const [open, setOpen] = useState(false);
  return <header className={`nx-nav ${dark ? "dark" : ""}`}><Link to="/" aria-label="NeuroSense overview"><Brand light={dark} /></Link>
    <div className="nx-nav-utilities"><MotionControl /><button className="nx-nav-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="public-navigation" aria-label={open ? "Close menu" : "Open menu"}>{open ? <X size={21} /> : <Menu size={21} />}</button></div>
    <nav id="public-navigation" className={open ? "open" : ""} aria-label="Project navigation" onClick={event => { if (event.target.closest("a")) setOpen(false); }}>
      {onSection && <><button onClick={() => { onSection("experience"); setOpen(false); }}>The experience</button><button onClick={() => { onSection("control"); setOpen(false); }}>Your control</button></>}
      <Link to="/tour">Workspace tour</Link>
      {user ? <Link className="nx-button small" to="/home">Open home<ArrowUpRight size={15} /></Link> : <><Link className="nx-nav-signin" to="/login">Sign in</Link><Link className="nx-button small" to="/register">Get started<ArrowUpRight size={15} /></Link></>}
    </nav>
  </header>;
}
