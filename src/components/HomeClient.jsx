"use client";

import { useState } from "react";
import { Database, FileSpreadsheet, Menu, X } from "lucide-react";
import SqlAnalyzerPage from "./SqlAnalyzerPage";
import SqlFileExplorerPage from "./SqlFileExplorerPage";

export default function HomeClient() {
  const [activePage, setActivePage] = useState("analyzer");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="text-blue-500" size={28} />
              <span className="hidden text-xl font-bold text-white sm:inline">
                SQL Suite
              </span>
            </div>

            <div className="hidden gap-4 md:flex">
              <button
                onClick={() => setActivePage("analyzer")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 font-semibold transition ${
                  activePage === "analyzer"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Database size={18} />
                SQL Analyzer
              </button>
              <button
                onClick={() => setActivePage("file-explorer")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 font-semibold transition ${
                  activePage === "file-explorer"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <FileSpreadsheet size={18} />
                SQL File Explorer
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="text-gray-300 hover:text-white md:hidden"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {mobileMenuOpen ? (
            <div className="space-y-2 pb-4 md:hidden">
              <button
                onClick={() => {
                  setActivePage("analyzer");
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 font-semibold transition ${
                  activePage === "analyzer"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Database size={18} />
                SQL Analyzer
              </button>
              <button
                onClick={() => {
                  setActivePage("file-explorer");
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 font-semibold transition ${
                  activePage === "file-explorer"
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <FileSpreadsheet size={18} />
                SQL File Explorer
              </button>
            </div>
          ) : null}
        </div>
      </nav>

      {activePage === "analyzer" ? <SqlAnalyzerPage /> : null}
      {activePage === "file-explorer" ? <SqlFileExplorerPage /> : null}
    </div>
  );
}
