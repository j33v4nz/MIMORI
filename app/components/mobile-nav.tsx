"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { NavLinks } from "./nav-links";
import { Menu, X } from "lucide-react";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      setIsOpen(false);
    }
  }, [pathname]);

  // Auto-close on desktop resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (!isOpen || !panelRef.current) return;
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.key === "Tab") {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.addEventListener("keydown", trapFocus);
      panelRef.current?.focus();
      document.body.style.overflow = "hidden";
    } else {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    }
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = "";
    };
  }, [isOpen, trapFocus]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden text-primary hover:text-on-surface transition-colors flex items-center justify-center p-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-dialog"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
      {isOpen && createPortal(
        <>
          <div
            className="md:hidden fixed inset-0 top-16 z-40 bg-black/50 fade-in"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-dialog"
            ref={panelRef}
            role="dialog"
            aria-label="Navigation menu"
            className="md:hidden fixed left-0 right-0 top-16 bottom-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col pt-8 border-t-[0.5px] border-outline-variant overflow-y-auto fade-in"
            tabIndex={-1}
          >
            <nav aria-label="Mobile navigation" className="flex-1">
              <NavLinks />
            </nav>
            <div className="mt-auto px-6 py-6 border-t border-on-surface flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 relative flex-shrink-0 flex items-center justify-center">
                  <Image
                    src="/logo.png"
                    alt="MIMORI Logo"
                    width={32}
                    height={32}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="relative h-6 w-24 flex items-center">
                  <Image
                    src="/mimori.png"
                    alt="MIMORI"
                    width={96}
                    height={24}
                    className="h-full w-auto object-contain"
                  />
                </div>
              </div>
              <span className="font-data-mono text-[9px] text-secondary uppercase tracking-widest">MIMORI · v1.1.0</span>
            </div>
          </div>
        </>, document.body
      )}
    </>
  );
}
