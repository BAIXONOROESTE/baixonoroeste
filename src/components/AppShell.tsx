import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { Home, ClipboardList, BarChart3, Menu, LogOut, X, Package, Trophy, FileText, ScrollText, Users, Settings, AlertTriangle, ChevronLeft, CheckSquare } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useAutoSync } from "@/hooks/useAutoSync";

const bottomNav = [
  { to: "/inicio", label: "Início", icon: Home, roles: ["admin","supervisor","contador"] },
  { to: "/contar", label: "Contar", icon: ClipboardList, roles: ["admin","supervisor"] },
  { to: "/dashboard", label: "Painel", icon: BarChart3, roles: ["admin","supervisor","contador"] },
] as const;

const drawerLinks = [
  { to: "/inicio", label: "Início", icon: Home, roles: ["admin","supervisor","contador"] },
  { to: "/contar", label: "Nova contagem", icon: ClipboardList, roles: ["admin","supervisor"] },
  { to: "/inventarios", label: "Inventários", icon: Package, roles: ["admin","supervisor","contador"] },
  { to: "/checklists", label: "Checklists", icon: CheckSquare, roles: ["admin","supervisor","contador"] },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin","supervisor"] },
  { to: "/ranking", label: "Ranking", icon: Trophy, roles: ["admin","supervisor","contador"] },
  { to: "/perdas", label: "Perdas & Quebras", icon: AlertTriangle, roles: ["admin","supervisor","contador"] },
  { to: "/relatorios", label: "Relatórios", icon: FileText, roles: ["admin","supervisor"] },
  { to: "/logs", label: "Logs", icon: ScrollText, roles: ["admin","supervisor"] },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["admin"] },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  useAutoSync();

  const mainTabs = ["/inicio", "/contar", "/dashboard"];
  const isMainTab = mainTabs.includes(location.pathname);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/inicio" });
    }
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  }

  const role = profile?.role ?? "contador";
  const visible = drawerLinks.filter((l) => (l.roles as readonly string[]).includes(role));

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur">
        {isMainTab ? (
          <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-muted" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={handleBack} className="rounded-md p-2 hover:bg-muted" aria-label="Voltar">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-muted" aria-label="Menu">
              <Menu className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-lg font-display font-semibold text-primary">📦 Baixo Noroeste</span>
          <span className="hidden sm:inline text-sm font-display text-muted-foreground">Inventário</span>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatusBadge />
          <div className="h-9 w-9 rounded-full bg-primary/20 grid place-items-center text-xs font-semibold text-primary">
            {profile?.full_name?.slice(0, 2).toUpperCase() ?? "…"}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {bottomNav.filter((i) => (i.roles as readonly string[]).includes(role)).map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="relative w-72 max-w-[80%] bg-sidebar text-sidebar-foreground shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border">
              <span className="font-display font-semibold text-primary">📦 Baixo Noroeste</span>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-sidebar-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-4 py-4 border-b border-sidebar-border">
              <div className="text-sm font-medium">{profile?.full_name}</div>
              <div className="text-xs text-muted-foreground capitalize">{role}</div>
            </div>
            <ul className="flex-1 overflow-auto py-2">
              {visible.map((l) => {
                const Icon = l.icon;
                const active = location.pathname === l.to;
                return (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 text-sm ${active ? "bg-sidebar-accent text-primary" : "hover:bg-sidebar-accent"}`}
                    >
                      <Icon className="h-4 w-4" />
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-sidebar-border p-3">
              <Button variant="outline" className="w-full" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
