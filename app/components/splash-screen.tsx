"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("mimori_splash_seen")) {
      setTimeout(() => setIsVisible(false), 0);
      return;
    }
    
    sessionStorage.setItem("mimori_splash_seen", "true");

    // Start fading out after 1.2 seconds
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 1200);

    // Completely remove from DOM after 1.6 seconds
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 1600);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-surface flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 select-none ${
        isFading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Background technical grid */}
      <div
        className="absolute inset-0 grid-bg opacity-40 pointer-events-none"
      />

      {/* Center Branding Container */}
      <div className="flex flex-col items-center space-y-4 relative z-10">
        {/* Logo mark */}
        <div className="relative w-36 h-36 flex items-center justify-center">
          <Image
            alt="MIMORI System Mark"
            className="w-full h-full object-contain"
            src="/logo.png"
            width={144}
            height={144}
            priority
          />
        </div>

        {/* Brand Text / Wordmark */}
        <div className="relative h-10 w-48 flex items-center justify-center">
          <Image
            alt="MIMORI"
            className="h-full w-auto object-contain"
            src="/mimori.png"
            width={192}
            height={40}
            priority
          />
        </div>

        {/* Loading status */}
        <div className="font-label-xs text-[11px] text-secondary tracking-widest uppercase flex items-center gap-2 pt-2">
          <span className="inline-block w-2 h-2 bg-primary animate-pulse" />
          <span>CONTROL_PLANE // INITIALIZING</span>
        </div>
      </div>
    </div>
  );
}
