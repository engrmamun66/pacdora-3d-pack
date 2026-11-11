"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ExternalLink, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from "lucide-react";

type Theme = "light" | "dark" | "system";
const THEME_KEY = "admin-theme";

const DrawerContext = createContext<{ close: () => void }>({ close: () => undefined });
/** Lets a nav link close the sidebar drawer on small screens. */
export const useAdminDrawer = () => useContext(DrawerContext);

const SIDEBAR_KEY = "admin-sidebar";
type SidebarState = "expanded" | "collapsed";

// Runs before the first paint so a saved dark theme or a collapsed sidebar does not flash the other way.
const NO_FLASH = `(function(){try{var r=document.getElementById('admin-root');if(!r)return;var t=localStorage.getItem('${THEME_KEY}');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)r.classList.add('dark');r.setAttribute('data-sidebar',localStorage.getItem('${SIDEBAR_KEY}')==='collapsed'?'collapsed':'expanded')}catch(e){}})()`;

/**
 * A choice kept in localStorage that React can read without a flash or a hydration mismatch.
 * If storage is blocked (private mode) the choice lasts for this visit only.
 */
function createPref<T extends string>(key: string, fallback: T, valid: (v: string | null) => v is T) {
  let memory: T | null = null;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (memory) return memory;
    try {
      const v = localStorage.getItem(key);
      return valid(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  };
  const write = (v: T) => {
    memory = v;
    try {
      localStorage.setItem(key, v);
    } catch {
      /* kept in memory only */
    }
    listeners.forEach((f) => f());
  };
  return { read, subscribe, write, fallback };
}

const themePref = createPref<Theme>("admin-theme", "system", (v): v is Theme => v === "light" || v === "dark" || v === "system");
const sidebarPref = createPref<SidebarState>(SIDEBAR_KEY, "expanded", (v): v is SidebarState => v === "collapsed" || v === "expanded");

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Match system", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex items-center rounded-lg border bg-card p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
          className={`grid size-7 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${theme === value ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/**
 * Frame of the admin area: ink sidebar (a drawer on phones), a sticky top bar and the page.
 * Light/dark is kept on this element only (class "dark" on #admin-root), so the rest of the site is untouched.
 */
export function AdminShell({
  brand,
  nav,
  crumbs,
  user,
  siteUrl,
  children,
}: {
  brand: ReactNode;
  nav: ReactNode;
  crumbs: ReactNode;
  user: ReactNode;
  siteUrl: string;
  children: ReactNode;
}) {
  const theme = useSyncExternalStore(themePref.subscribe, themePref.read, () => themePref.fallback);
  const sidebar = useSyncExternalStore(sidebarPref.subscribe, sidebarPref.read, () => sidebarPref.fallback);
  const collapsed = sidebar === "collapsed";
  const [open, setOpen] = useState(false);

  // The state sits on #admin-root as data-sidebar, so CSS can restyle the sidebar and its links.
  useEffect(() => {
    document.getElementById("admin-root")?.setAttribute("data-sidebar", sidebar);
  }, [sidebar]);

  useEffect(() => {
    const root = document.getElementById("admin-root");
    if (!root) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div id="admin-root" className="admin-shell group/shell min-h-screen" suppressHydrationWarning>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      <a href="#admin-main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <div className="md:grid md:grid-cols-[256px_minmax(0,1fr)] md:transition-[grid-template-columns] md:duration-200 md:group-data-[sidebar=collapsed]/shell:grid-cols-[72px_minmax(0,1fr)] motion-reduce:md:transition-none">
        {open ? <div className="fixed inset-0 z-30 bg-black/50 md:hidden" aria-hidden onClick={() => setOpen(false)} /> : null}
        <aside
          id="admin-sidebar"
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[transform,visibility] duration-200 motion-reduce:transition-none md:visible md:sticky md:top-0 md:h-screen md:w-auto md:translate-x-0 ${open ? "visible translate-x-0" : "invisible -translate-x-full"}`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-5 md:group-data-[sidebar=collapsed]/shell:justify-center md:group-data-[sidebar=collapsed]/shell:px-0">
            <div className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-sidebar-accent-foreground md:group-data-[sidebar=collapsed]/shell:[&>img]:max-w-9 md:group-data-[sidebar=collapsed]/shell:[&>span:last-child]:hidden">{brand}</div>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md hover:bg-sidebar-accent md:hidden">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <DrawerContext.Provider value={{ close: () => setOpen(false) }}>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">{nav}</div>
          </DrawerContext.Provider>
          <div className="flex shrink-0 flex-col gap-1 border-t border-sidebar-border p-3">
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Visit site"
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:group-data-[sidebar=collapsed]/shell:justify-center"
            >
              <span className="md:group-data-[sidebar=collapsed]/shell:sr-only">Visit site</span>
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <button
              type="button"
              onClick={() => sidebarPref.write(collapsed ? "expanded" : "collapsed")}
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none md:flex md:group-data-[sidebar=collapsed]/shell:justify-center"
            >
              <span className="md:group-data-[sidebar=collapsed]/shell:sr-only">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
              {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              aria-controls="admin-sidebar"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="grid size-9 place-items-center rounded-lg border bg-card hover:bg-muted md:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">{crumbs}</div>
            <ThemeToggle theme={theme} onChange={themePref.write} />
            {user}
          </header>
          <main id="admin-main" className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
