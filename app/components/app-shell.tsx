"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  FileText,
  KeyRound,
  User,
  Shield,
  Check
} from "lucide-react";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { signOut } from "../auth/actions";

interface AppShellProps {
  children: ReactNode;
  user: any;
  disableAuth: boolean;
  showSidebar: boolean;
  vigilanceBadge: ReactNode;
}

export function AppShell({
  children,
  user,
  disableAuth,
  showSidebar,
  vigilanceBadge
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mimori_sidebar_open");
      if (saved !== null) return saved === "true";
    }
    return true;
  });
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const nextState = !prev;
      localStorage.setItem("mimori_sidebar_open", String(nextState));
      return nextState;
    });
  };

  const userInitial = user?.email ? user.email.slice(0, 2).toUpperCase() : "OP";
  const userEmail = user?.email || "operative@mimori.local";

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex w-full relative overflow-x-hidden">
      {/* SideNavBar (Desktop Only) with Smooth Collapse */}
      <aside
        aria-label="Sidebar navigation"
        className={`bg-surface h-screen w-64 border-r border-outline-variant/60 left-0 top-0 fixed flex flex-col justify-between z-40 hidden md:flex transition-all duration-300 ease-in-out shadow-[1px_0_4px_rgba(0,0,0,0.02)] ${
          sidebarOpen
            ? "translate-x-0 opacity-100 visible"
            : "-translate-x-full opacity-0 invisible pointer-events-none"
        }`}
      >
        {/* Header / Brand with Logo Emblem, Wordmark, and Collapse Button */}
        <div className="p-4 px-5 border-b border-outline-variant/60">
          <div className="flex items-center justify-between mb-2">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
                <Image
                  alt="MIMORI Logo"
                  className="w-full h-full object-contain"
                  src="/logo.png"
                  width={32}
                  height={32}
                  priority
                />
              </div>
              <div className="relative h-6 w-24 flex items-center">
                <Image
                  alt="MIMORI"
                  className="h-full w-auto object-contain"
                  src="/mimori.png"
                  width={96}
                  height={24}
                  priority
                />
              </div>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className="text-secondary hover:text-on-surface p-1 hover:bg-surface-container-high transition-colors"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          {vigilanceBadge}
        </div>

        {/* Navigation links */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto custom-scrollbar px-2 py-3">
          <NavLinks />
        </nav>

        {/* Footer Actions */}
        <div className="border-t border-outline-variant/60 p-4 space-y-3 bg-surface-container-low/30">
          <ul className="flex flex-col gap-1.5">
            <li>
              <Link
                href="/events"
                className="flex items-center gap-2.5 px-3 py-1.5 text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors font-mono text-xs uppercase tracking-wider"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-secondary" aria-hidden="true" />
                Audit Log
              </Link>
            </li>
            <li>
              <Link
                href="/keys"
                className="flex items-center gap-2.5 px-3 py-1.5 text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors font-mono text-xs uppercase tracking-wider"
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0 text-secondary" aria-hidden="true" />
                API Access
              </Link>
            </li>
          </ul>
          {!disableAuth && (
            <form action={signOut} className="pt-2 border-t border-outline-variant/60">
              <button
                type="submit"
                aria-label="Sign out of system"
                className="w-full text-left px-3 py-1.5 font-mono text-xs text-secondary hover:text-primary uppercase tracking-wider transition-colors flex items-center justify-between hover:bg-surface-container-high"
              >
                <span>Sign Out</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
          <div className="text-[10px] font-mono text-secondary/60 uppercase tracking-widest pt-1 px-3">
            MIMORI · v1.1.0
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen w-full transition-all duration-300 ease-in-out ${
          sidebarOpen ? "md:pl-64" : "md:pl-0"
        }`}
      >
        {/* TopNavBar */}
        <header className="flex justify-between items-center px-6 md:px-8 w-full h-16 border-b border-outline-variant/60 bg-surface/95 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle button on top bar */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden md:flex items-center justify-center text-secondary hover:text-on-surface p-1.5 border border-on-surface/40 hover:border-on-surface hover:bg-surface-container-high transition-colors"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4 text-primary" />
              )}
            </button>

            {/* When sidebar is collapsed, show the logo emblem and wordmark on the top bar */}
            {!sidebarOpen && (
              <Link
                href="/"
                className="hidden md:flex items-center gap-3 group hover:opacity-90 transition-opacity ml-1"
              >
                <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
                  <Image
                    src="/logo.png"
                    alt="MIMORI Logo"
                    width={32}
                    height={32}
                    className="w-full h-full object-contain"
                    priority
                  />
                </div>
                <div className="relative h-6 w-24 flex items-center">
                  <Image
                    src="/mimori.png"
                    alt="MIMORI"
                    width={96}
                    height={24}
                    className="h-full w-auto object-contain"
                    priority
                  />
                </div>
              </Link>
            )}

            {/* Mobile Header Logo */}
            <Link
              href="/"
              className="md:hidden flex items-center gap-2 group hover:opacity-90 transition-opacity"
            >
              <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="MIMORI Logo"
                  width={32}
                  height={32}
                  className="w-full h-full object-contain"
                  priority
                />
              </div>
              <div className="relative h-6 w-24 flex items-center">
                <Image
                  src="/mimori.png"
                  alt="MIMORI"
                  width={96}
                  height={24}
                  className="h-full w-auto object-contain"
                  priority
                />
              </div>
            </Link>
          </div>

          <Link href="/events" className="hidden md:flex items-center gap-2 border border-outline-variant/70 bg-surface-container-low/50 px-3 h-9 font-mono text-xs text-secondary hover:text-primary">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Browse Events
          </Link>

          {/* Right Profile & Mobile Menu */}
          <div className="flex items-center gap-3">
            {/* Mobile Menu trigger (Strictly mobile only) */}
            <div className="md:hidden">
              <MobileNav />
            </div>

            {/* Interactive User Profile Menu */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="w-8 h-8 border border-outline-variant hover:border-primary bg-surface-container-high flex items-center justify-center font-display-lg font-bold text-xs text-on-surface hover:text-primary transition-all select-none shadow-xs focus-visible:outline-none"
                title={userEmail}
                aria-expanded={profileDropdownOpen}
                aria-haspopup="true"
              >
                {userInitial}
              </button>

              {/* Profile Dropdown */}
              {profileDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-64 border border-outline-variant bg-surface shadow-lg z-50 p-4 space-y-3 font-body-md text-xs animate-in fade-in slide-in-from-top-1 duration-150"
                  role="menu"
                >
                  <div className="border-b border-outline-variant/60 pb-3">
                    <div className="font-mono text-[10px] text-secondary uppercase tracking-wider mb-1 font-semibold">
                      Authenticated Operator
                    </div>
                    <div className="font-bold text-on-surface text-sm truncate" title={userEmail}>
                      {userEmail}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Signed in</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 p-2 text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors font-mono text-xs uppercase tracking-wider"
                    >
                      <Shield className="w-3.5 h-3.5 text-primary" />
                      <span>Security Settings</span>
                    </Link>
                    <Link
                      href="/keys"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 p-2 text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors font-mono text-xs uppercase tracking-wider"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-primary" />
                      <span>API Keys</span>
                    </Link>
                  </div>

                  {!disableAuth && (
                    <div className="border-t border-outline-variant/60 pt-2">
                      <form action={signOut}>
                        <button
                          type="submit"
                          className="w-full text-left p-2 text-error hover:bg-error/10 transition-colors font-mono text-xs uppercase tracking-wider flex items-center justify-between font-semibold"
                        >
                          <span>Sign Out</span>
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Container */}
        <main
          id="main-content"
          className="flex-1 px-6 md:px-8 lg:px-10 py-8 md:py-10 max-w-7xl w-full mx-auto relative flex flex-col justify-between"
        >
          <div className="w-full flex-1">{children}</div>

          {/* Architectural Footer */}
          <footer className="mt-16 pt-6 pb-8 flex flex-col sm:flex-row justify-between items-center w-full border-t border-outline-variant/60 bg-transparent text-secondary text-xs gap-4">
            <span className="font-mono text-[11px] uppercase tracking-wider text-secondary font-semibold">
              © 2026 MIMORI OSS. v1.1.0
            </span>
            <div className="flex gap-4 items-center">
              <Link
                className="font-mono text-[11px] uppercase tracking-wider text-secondary hover:text-primary transition-colors"
                href="/events"
              >
                Telemetry
              </Link>
              <span className="w-[1px] h-3 bg-outline-variant/80"></span>
              <Link
                className="font-mono text-[11px] uppercase tracking-wider text-secondary hover:text-primary transition-colors"
                href="/detections"
              >
                Security
              </Link>
              <span className="w-[1px] h-3 bg-outline-variant/80"></span>
              <Link
                className="font-mono text-[11px] uppercase tracking-wider text-secondary hover:text-primary transition-colors"
                href="/rules"
              >
                Rules
              </Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
