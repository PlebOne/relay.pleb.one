"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const characters = "ₜ₃ᵨ☉⚡▢▣▤▥▦▧▨▩⚡₿Ƀאבגדהוזחטיכל1234567890";
    const fontSize = 18;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    let columns = Math.floor(width / fontSize);
    let drops = new Array(columns).fill(1);
    let animationFrameId: number;

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#22c55e";
      ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = characters.charAt(Math.floor(Math.random() * characters.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      columns = Math.floor(width / fontSize);
      drops = new Array(columns).fill(1);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="matrix-canvas fixed inset-0 pointer-events-none z-0" />;
}

export function TerminalWindow({ 
  children, 
  title = "relay.pleb.one" 
}: { 
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="terminal-window rounded-lg overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-green-500/50">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div className="text-green-400 text-sm font-mono">{title}</div>
        <div className="w-16"></div>
      </div>
      
      {/* Terminal Content */}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

export function GlowingButton({ 
  children, 
  variant = "primary",
  className = "",
  asChild = false,
  ...props 
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const baseClasses = "px-6 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105";
  
  const variants = {
    primary: "bg-green-600 text-black hover:bg-green-500 cyber-glow",
    secondary: "border border-green-400 text-green-400 hover:bg-green-400 hover:text-black neon-border"
  };

  const combinedClassName = `${baseClasses} ${variants[variant]} ${className}`;

  if (asChild && isValidElement(children)) {
    return cloneElement(children, {
      className: `${combinedClassName} ${children.props.className ?? ""}`.trim(),
    });
  }
  
  return (
    <button 
      className={combinedClassName}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusIndicator({ 
  status = "online" 
}: { 
  status?: "online" | "offline" | "syncing" 
}) {
  const statusConfig = {
    online: { color: "bg-green-400", text: "ONLINE", pulse: "animate-pulse" },
    offline: { color: "bg-red-400", text: "OFFLINE", pulse: "" },
    syncing: { color: "bg-yellow-400", text: "SYNCING", pulse: "animate-pulse" }
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center space-x-2">
      <div className={`w-2 h-2 rounded-full ${config.color} ${config.pulse}`}></div>
      <span className="text-xs font-mono text-gray-400">{config.text}</span>
    </div>
  );
}

export function BitcoinPrice() {
  const [price, setPrice] = useState<number | null>(null);
  
  useEffect(() => {
    // Mock Bitcoin price - in real app would fetch from API
    setPrice(43250 + Math.random() * 1000);
  }, []);
  
  return (
    <div className="flex items-center space-x-2 text-sm">
      <span className="text-bitcoin-400">₿</span>
      <span className="text-white font-mono">
        ${price ? price.toLocaleString() : "Loading..."}
      </span>
    </div>
  );
}