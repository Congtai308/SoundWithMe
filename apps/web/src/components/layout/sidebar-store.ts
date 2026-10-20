import { create } from "zustand";

export const SIDEBAR_STORAGE_KEY = "swm.sidebar.collapsed";

/**
 * Applied before hydration by the inline script in the root layout, so a
 * collapsed sidebar doesn't flash open on load. Kept in sync with the store.
 */
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem("${SIDEBAR_STORAGE_KEY}")==="1")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Desktop nav dock: shown (288px) or slid fully out of view. The `undock:`
 * Tailwind variant reads `html[data-sidebar]`, so the layout reacts without
 * every component subscribing to this store.
 */
interface SidebarStore {
  collapsed: boolean;
  hydrate: () => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  collapsed: false,
  hydrate: () => set({ collapsed: readCollapsed() }),
  toggle: () => {
    const collapsed = !get().collapsed;
    set({ collapsed });
    if (collapsed) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // The choice just won't survive a reload.
    }
  },
}));
