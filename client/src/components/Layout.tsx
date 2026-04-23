import { Link, useLocation } from "wouter";
import { Shield, ClipboardList, Clock } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-white dark:bg-card shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: "var(--color-navy)" }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight" style={{ color: "var(--color-navy)" }}>SEMPER SOLUTUS</div>
              <div className="text-xs leading-tight" style={{ color: "var(--color-gold)" }}>Internal QC Screener</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                location === "/" 
                  ? "text-white" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              style={location === "/" ? { background: "var(--color-navy)" } : {}}
            >
              <ClipboardList className="w-4 h-4" />
              Screen a Form
            </Link>
            <Link
              href="/history"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                location === "/history"
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              style={location === "/history" ? { background: "var(--color-navy)" } : {}}
            >
              <Clock className="w-4 h-4" />
              Review History
            </Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Semper Solutus Internal Tool — Not for client distribution
      </footer>
    </div>
  );
}
