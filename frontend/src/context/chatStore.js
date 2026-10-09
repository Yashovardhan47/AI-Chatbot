import { create } from "zustand";
import { chatAPI, memoryAPI, fileAPI, createChatSocket } from "../services/api";
import api from "../services/api";

const useChatStore = create((set, get) => ({
  chats: [],
  activeChat: null,
  messages: [],
  memories: [],
  historyGroups: {},
  streaming: false,
  streamBuffer: "",
  socket: null,

  fetchChats: async () => {
    try {
      const { data } = await chatAPI.getAll();
      set({ chats: data.chats });
    } catch { set({ chats: [] }); }
  },

  fetchHistory: async () => {
    try {
      const { data } = await api.get("/chat/history");
      set({ historyGroups: data.groups || {} });
    } catch { set({ historyGroups: {} }); }
  },

  getTodayChat: async () => {
    try {
      const { data } = await api.post("/chat/daily");
      const chat = data.chat;
      set(s => ({ chats: s.chats.find(c => c.id === chat.id) ? s.chats : [chat, ...s.chats] }));
      return chat;
    } catch { return null; }
  },

  openChat: async id => {
    try {
      const { data } = await chatAPI.getOne(id);
      set({ activeChat: data.chat, messages: data.chat.messages || [] });
      get()._connectSocket(id);
    } catch {}
  },

  newChat: async (projectId = null) => {
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
      onDelta: delta => set(s => ({ streamBuffer: s.streamBuffer + delta, streaming: true })),
      onDone: meta => {
        set(s => ({
          messages: [...s.messages, {
            role: "assistant", content: s.streamBuffer,
            confidence: meta.confidence, reasoning: meta.reasoning,
            sources: meta.sources, memory_note: meta.memory, id: Date.now(),
          }],
          streaming: false, streamBuffer: "",
          chats: s.chats.map(c => c.id === s.activeChat?.id
            ? { ...c, updated_at: new Date().toISOString(), message_count: (c.message_count || 0) + 2 }
            : c),
        }));
        if (meta.memory) {
          set(s => ({ memories: [{ id: Date.now(), fact: meta.memory, created_at: new Date() }, ...s.memories] }));
        }
        get().fetchHistory();
      },
      onChatCreated: newId => {
        set(s => ({
          activeChat: { ...s.activeChat, id: newId },
          chats: [{ id: newId, title: "New Conversation", updated_at: new Date().toISOString() }, ...s.chats],
        }));
        get().fetchHistory();
      },
    });
    set({ socket: ws });
  },

  sendMessage: ({ content, attachments = [], mode = "auto", webSearch = false, model = "claude-sonnet-4-6" }) => {
    const { socket } = get();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const userMsg = { role: "user", content, attachments, id: Date.now(), created_at: new Date() };
    set(s => ({ messages: [...s.messages, userMsg], streaming: true, streamBuffer: "" }));
    socket.send(JSON.stringify({ type: "message", content, attachments, mode, web_search: webSearch, model }));
  },

  uploadFiles: async files => {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    const { data } = await fileAPI.upload(fd);
    return data.files;
  },

  fetchMemories: async () => {
    try {
      const { data } = await memoryAPI.getAll();
      set({ memories: data.memories });
    } catch { set({ memories: [] }); }
  },

  deleteMemory: async id => {
    await memoryAPI.delete(id);
    set(s => ({ memories: s.memories.filter(m => m.id !== id) }));
  },

  clearMemories: async () => {
    await memoryAPI.clearAll();
    set({ memories: [] });
  },
}));

export default useChatStore;
