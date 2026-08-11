"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

interface HeaderProps {
  activeTab: "dashboard" | "templates";
}

export default function Header({ activeTab }: HeaderProps) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (nextTheme === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  };

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-zinc-900 dark:text-white px-6 py-4 flex items-center justify-between font-sans transition-colors duration-200">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="font-bold tracking-wider text-sm">SAGEPILOT // Order Supervisor AI</span>
        <span className="text-zinc-400 dark:text-zinc-600 text-xs font-mono">POC v1.0</span>
      </div>
      
      <nav className="flex gap-6 text-xs font-semibold">
        <Link 
          href="/" 
          className={`hover:text-zinc-900 dark:hover:text-white transition-colors py-1 ${
            activeTab === "dashboard" 
              ? "text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-white" 
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          Dashboard
        </Link>
        <Link 
          href="/templates" 
          className={`hover:text-zinc-900 dark:hover:text-white transition-colors py-1 ${
            activeTab === "templates" 
              ? "text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-white" 
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          Supervisor Templates
        </Link>
      </nav>

      <div className="flex items-center gap-4 text-xs">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all cursor-pointer"
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-indigo-600" />
          )}
        </button>
        <div className="text-zinc-400 dark:text-zinc-500 hidden sm:block">
          GROQ API: <span className="text-emerald-500 font-mono font-bold">CONNECTED</span>
        </div>
      </div>
    </header>
  );
}
