import { useEffect, useRef } from "react";

/* Lightweight ambient background — no O(n^2) connection math, low particle count,
   pauses when tab is hidden. This replaces the old heavy version that caused lag. */
export default function LivingBackground({ mode = "auto" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const COLORS = {
    auto: ["#534AB7", "#7C3AED"], friend: ["#1D9E75", "#34D399"],
    teacher: ["#378ADD", "#60A5FA"], researcher: ["#D85A30", "#FB923C"],
    coder: ["#0F6E56", "#10B981"], mentor: ["#BA7517", "#F59E0B"],
  };
  const palette = COLORS[mode] || COLORS.auto;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const N = 18; // low count — cheap to animate
    const particles = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 2 + 1, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
      color: palette[i % palette.length],
    }));

    function draw() {
      if (!running) return;
      animRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        grd.addColorStop(0, p.color + "55"); grd.addColorStop(1, p.color + "00");
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.color + "aa"; ctx.fill();
      });
    }

    const onVisibility = () => {
      running = !document.hidden;
      if (running) draw();
      else cancelAnimationFrame(animRef.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    draw();

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.5 }} />;
}
