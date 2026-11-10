"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const STORAGE_KEYS = {
  left: "ba-charter:left-nav-collapsed",
  right: "ba-charter:right-panel-collapsed",
} as const;

// Dispatched after writing a toggle so useSyncExternalStore re-reads the new
// value — localStorage writes from the same tab don't fire a "storage" event.
const LOCAL_CHANGE_EVENT = "ba-charter:aside-collapsed-changed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_CHANGE_EVENT, onChange);
  };
}

function getSnapshot(storageKey: string) {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Wraps a project layout side panel (left nav or right activity panel) with
 * a collapse/expand toggle. Remembered in localStorage per side — purely a
 * chrome preference, not project data, so it isn't scoped per project.
 */
export function CollapsibleAside({
  side,
  expandedWidthClass,
  label,
  children,
}: {
  side: "left" | "right";
  expandedWidthClass: string;
  label: string;
  children: ReactNode;
}) {
  const storageKey = STORAGE_KEYS[side];
  const collapsed = useSyncExternalStore(subscribe, () => getSnapshot(storageKey), getServerSnapshot);

  const toggle = () => {
    try {
      localStorage.setItem(storageKey, collapsed ? "0" : "1");
    } catch {
      // Private browsing / blocked storage — toggle just won't persist.
    }
    window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  };

  const collapseIcon = side === "left" ? <ChevronLeftIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />;
  const expandIcon = side === "left" ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />;

  return (
    <aside
      className={cn(
        "scrollbar-thin h-full shrink-0 overflow-y-auto",
        side === "left" ? "border-r" : "border-l",
        "border-surface-border",
        collapsed ? "w-10" : expandedWidthClass
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        className="flex h-10 w-full items-center justify-center text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
      >
        {collapsed ? expandIcon : collapseIcon}
      </button>
      {!collapsed && <div className="px-4 pb-6 pt-2">{children}</div>}
    </aside>
  );
}
