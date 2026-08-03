import { useSyncExternalStore } from "react";
import type { AppState, ChatMsg, Mode, ModeState, PromptPlacement } from "./types";
import { MAX_CHAT_HISTORY } from "./constants";

const HISTORY_KEY_PREFIX = "atelier_history_";
const CHAT_HISTORY_KEY = "atelier_chat_history";
export const PROMPT_PLACEMENT_KEY = "atelier_prompt_placement";

function loadPromptPlacement(): PromptPlacement {
  try {
    return localStorage.getItem(PROMPT_PLACEMENT_KEY) === "center" ? "center" : "sidebar";
  } catch {
    return "sidebar";
  }
}

const API_KEY_KEY = "atelier_api_key";

function loadApiKey(): string {
  try {
    return sessionStorage.getItem(API_KEY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string) {
  try {
    if (key) sessionStorage.setItem(API_KEY_KEY, key);
    else sessionStorage.removeItem(API_KEY_KEY);
  } catch { /* sessionStorage เต็มหรือถูกปิด — ข้ามไปเงียบๆ ไม่กระทบการใช้งานหลัก */ }
}

function loadHistory(mode: Mode): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY_PREFIX + mode);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveHistory(mode: Mode) {
  try {
    localStorage.setItem(HISTORY_KEY_PREFIX + mode, JSON.stringify(state.modes[mode].history));
  } catch { /* localStorage เต็มหรือถูกปิด — ข้ามไปเงียบๆ ไม่กระทบการใช้งานหลัก */ }
}

function loadChatHistory(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((m): m is ChatMsg => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      : [];
  } catch {
    return [];
  }
}

export function saveChatHistory() {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(state.chatMessages.slice(-MAX_CHAT_HISTORY)));
  } catch { /* เงียบเช่นเดียวกับ history */ }
}

function freshModeState(mode: Mode): ModeState {
  return {
    prompt: "",
    modelId: null,
    ratio: "1:1",
    count: 1,
    duration: 8,
    audio: false,
    refs: [], // memory-only โดยตั้งใจ เช่นเดียวกับ apiKey/gallery — data URL ใหญ่เกินจะลง localStorage
    images: [],
    queue: [],
    history: loadHistory(mode),
    selected: new Set(),
    lbIndex: -1,
  };
}

// apiKey เก็บใน sessionStorage — อยู่รอด refresh แต่หายเมื่อปิด tab/browser
export const state: AppState = {
  apiKey: loadApiKey(),
  models: [],
  videoModels: [],
  modelsFailed: false,
  videoModelsFailed: false,
  mode: "home",
  modes: {
    home: freshModeState("home"),
    infographic: freshModeState("infographic"),
    video: freshModeState("video"),
  },
  seq: 0,
  keyModalOpen: false,
  chatOpen: false,
  chatMessages: loadChatHistory(),
  chatPending: false,
  optimize: { status: "idle", result: null, error: "" },
  toast: { msg: "", n: 0 },
  sidebarCollapsed: false,
  promptPlacement: loadPromptPlacement(),
  lbFormat: "png",
};

let version = 0;
const listeners = new Set<() => void>();

/** mutate state แล้ว broadcast ให้ทุก component ที่ useApp() re-render — แทน render() เดิมของ legacy */
export function mutate(fn?: (s: AppState) => void) {
  if (fn) fn(state);
  version++;
  for (const l of listeners) l();
}

export function useApp(): AppState {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => version
  );
  return state;
}

export const cur = () => state.modes[state.mode];

export function toast(msg: string) {
  mutate(s => { s.toast = { msg, n: s.toast.n + 1 }; });
}
