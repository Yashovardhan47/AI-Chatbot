import { create } from "zustand";
import { chatAPI, memoryAPI, fileAPI, createChatSocket } from "../services/api";
import api from "../services/api";
import toast from "react-hot-toast";

const useChatStore = create((set, get) => ({
  chats: [],
  activeChat: null,
  messages: [],
  memories: [],
  memoryTotal: 0,
  memoryError: null,
  historyGroups: {},
  streaming: false,
  streamBuffer: "",
  socket: null,
  openRequest: 0,

  fetchChats: async () => {
    const token = localStorage.getItem("accessToken");
    try {
      const { data } = await chatAPI.getAll();
      if (token !== localStorage.getItem("accessToken")) return;
      set({ chats: data.chats });
    } catch { set({ chats: [] }); }
  },

  fetchHistory: async () => {
    const token = localStorage.getItem("accessToken");
    try {
      const { data } = await api.get("/chat/history");
      if (token !== localStorage.getItem("accessToken")) return;
      set({ historyGroups: data.groups || {} });
    } catch { set({ historyGroups: {} }); }
  },

  getTodayChat: async () => {
    const token = localStorage.getItem("accessToken");
    try {
      const { data } = await api.post("/chat/daily");
      if (token !== localStorage.getItem("accessToken")) return null;
      const chat = data.chat;
      set(s => ({ chats: s.chats.find(c => c.id === chat.id) ? s.chats : [chat, ...s.chats] }));
      return chat;
    } catch { return null; }
  },

  openChat: async id => {
    get().disconnect();
    const request = get().openRequest + 1;
    set({ openRequest: request });
    try {
      const { data } = await chatAPI.getOne(id);
      if (get().openRequest !== request) return;
      set({ activeChat: data.chat, messages: data.chat.messages || [] });
      get()._connectSocket(id);
    } catch { toast.error("Unable to open conversation"); }
  },

  newChat: async (projectId = null) => {
    get().disconnect();
    const { data } = await chatAPI.create({ project_id: projectId, mode: "auto" });
    const chat = data.chat;
    set(s => ({ chats: [chat, ...s.chats], activeChat: chat, messages: [] }));
    get()._connectSocket(chat.id);
    get().fetchHistory();
    return chat;
  },

  deleteChat: async id => {
    await chatAPI.delete(id);
    set(s => ({
      chats: s.chats.filter(c => c.id !== id),
      activeChat: s.activeChat?.id === id ? null : s.activeChat,
      messages: s.activeChat?.id === id ? [] : s.messages,
    }));
    get().fetchHistory();
  },

  updateChat: async (id, updates) => {
    await chatAPI.update(id, updates);
    set(s => ({ chats: s.chats.map(c => c.id === id ? { ...c, ...updates } : c) }));
    get().fetchHistory();
  },

  _connectSocket: chatId => {
    const old = get().socket;
    if (old) { try { old.close(); } catch {} }
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    const ws = createChatSocket(chatId, token, {
      onDelta: delta => {
        if (get().socket !== ws) return;
        set(s => ({ streamBuffer: s.streamBuffer + delta, streaming: true }));
      },
      onDone: meta => {
        if (get().socket !== ws) return;
        set(s => ({
          messages: [...s.messages, {
            role: "assistant", content: meta.content ?? s.streamBuffer,
            confidence: meta.confidence, reasoning: meta.reasoning,
            sources: meta.sources, memory_receipt: meta.memory_receipt, id: meta.message_id || Date.now(),
          }],
          streaming: false, streamBuffer: "",
          chats: s.chats.map(c => c.id === s.activeChat?.id
            ? { ...c, updated_at: new Date().toISOString(), message_count: (c.message_count || 0) + 2 }
            : c),
        }));
        get().fetchMemories();
        if (meta.memory_warning) toast.error(meta.memory_warning);
        get().fetchHistory();
      },
      onChatCreated: newId => {
        if (get().socket !== ws) return;
        set(s => ({
          activeChat: { ...s.activeChat, id: newId },
          chats: [{ id: newId, title: "New Conversation", updated_at: new Date().toISOString() }, ...s.chats],
        }));
        get().fetchHistory();
      },
      onError: message => {
        if (get().socket !== ws) return;
        set({ streaming: false, streamBuffer: "" });
        toast.error(message);
      },
      onClose: () => {
        if (get().socket !== ws) return;
        if (get().streaming) toast.error("Chat disconnected. Reload to continue.");
        set({ streaming: false, streamBuffer: "", socket: null });
      },
    });
    set({ socket: ws });
  },

  sendMessage: ({ content, attachments = [], mode = "auto", webSearch = false, model = "claude-sonnet-4-6", privateMode = false }) => {
    const { socket } = get();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("Chat is connecting. Please try again in a moment.");
      return false;
    }
    const userMsg = { role: "user", content, attachments, id: Date.now(), created_at: new Date() };
    set(s => ({ messages: [...s.messages, userMsg], streaming: true, streamBuffer: "" }));
    socket.send(JSON.stringify({ type: "message", content, attachments, mode, web_search: webSearch, model, private: privateMode }));
    return true;
  },

  uploadFiles: async files => {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    const { data } = await fileAPI.upload(fd);
    return data.files;
  },

  fetchMemories: async () => {
    const token = localStorage.getItem("accessToken");
    try {
      const { data } = await memoryAPI.getAll();
      if (token !== localStorage.getItem("accessToken")) return;
      set({ memories: data.memories, memoryTotal: data.total, memoryError: null });
    } catch { set({ memoryError: "Unable to load memories" }); }
  },

  deleteMemory: async id => {
    await memoryAPI.delete(id);
    await get().fetchMemories();
  },

  clearMemories: async () => {
    await memoryAPI.clearAll();
    set({ memories: [], memoryTotal: 0 });
  },

  disconnect: () => {
    const socket = get().socket;
    set({ socket: null, streaming: false, streamBuffer: "", openRequest: get().openRequest + 1 });
    if (socket) { try { socket.close(); } catch {} }
  },
  reset: () => {
    get().disconnect();
    set({ chats: [], activeChat: null, messages: [], memories: [], memoryTotal: 0, memoryError: null, historyGroups: {} });
  },
}));

window.addEventListener("auth:logout", () => useChatStore.getState().reset());
export default useChatStore;
