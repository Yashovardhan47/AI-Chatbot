import { useEffect, useRef } from "react";

export default function AIAvatar({ thinking = false, size = 48, mode = "auto" }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const t = useRef(0);

  const COLORS = {
    auto: "#534AB7", friend: "#1D9E75", teacher: "#378ADD",
    researcher: "#D85A30", coder: "#0F6E56", mentor: "#BA7517",
  };
  const color = COLORS[mode] || COLORS.auto;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = size; canvas.height = size;
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      t.current += thinking ? 0.08 : 0.02;
      ctx.clearRect(0, 0, size, size);

      const pulse = thinking ? 1 + Math.sin(t.current * 3) * 0.15 : 1 + Math.sin(t.current) * 0.04;
      const ringR = r * pulse;

      const glow = ctx.createRadialGradient(cx, cy, ringR * 0.5, cx, cy, ringR + 6);
      glow.addColorStop(0, color + "44"); glow.addColorStop(1, color + "00");
      ctx.beginPath(); ctx.arc(cx, cy, ringR + 6, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();

      const bg = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, 0, cx, cy, r);
      bg.addColorStop(0, color + "44"); bg.addColorStop(1, color + "11");
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();

      ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = color + "cc"; ctx.lineWidth = 1.5; ctx.stroke();

      if (thinking) {
        ctx.beginPath(); ctx.arc(cx, cy, ringR, t.current, t.current + Math.PI * 1.2);
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      }

      const nodes = 6;
      for (let i = 0; i < nodes; i++) {
        const angle = (i / nodes) * Math.PI * 2 + t.current * 0.3;
        const nr = r * 0.45;
        const nx = cx + Math.cos(angle) * nr, ny = cy + Math.sin(angle) * nr;
        const nodeR = 2.5 + Math.sin(t.current * 2 + i) * 1;
        ctx.beginPath(); ctx.arc(nx, ny, nodeR, 0, Math.PI * 2); ctx.fillStyle = color + "ee"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny);
        ctx.strokeStyle = color + "55"; ctx.lineWidth = 0.8; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(cx, cy, 4 + Math.sin(t.current * 2) * 1, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [thinking, size, mode]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ display: "block" }} />;
}
