import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), sockets: [], createSocket: vi.fn() }));
vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
  chatAPI: {}, fileAPI: {}, memoryAPI: { getAll: mocks.getAll },
  createChatSocket: mocks.createSocket,
}));
import useChatStore from "./chatStore";

beforeEach(() => {
  useChatStore.getState().reset();
  vi.clearAllMocks();
  localStorage.setItem("accessToken", "account-one");
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  mocks.sockets = [];
  mocks.createSocket.mockImplementation((id, token, handlers) => {
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn(), handlers };
    mocks.sockets.push(socket);
    return socket;
  });
  mocks.getAll.mockResolvedValue({ data: { memories: [], total: 0 } });
});

describe("chat memory lifecycle", () => {
  it("does not report a message as sent before the socket is ready", () => {
    expect(useChatStore.getState().sendMessage({ content: "Keep this input" })).toBe(false);
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("ignores late answers from an earlier chat socket", () => {
    useChatStore.getState()._connectSocket("first");
    const old = mocks.sockets[0];
    useChatStore.getState()._connectSocket("second");
    old.handlers.onDelta("private earlier answer");
    old.handlers.onDone({ content: "private earlier answer" });
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().streamBuffer).toBe("");
  });

  it("sends the privacy flag and uses clean final content instead of streamed metadata", () => {
    useChatStore.getState()._connectSocket("chat");
    const socket = mocks.sockets[0];
    expect(useChatStore.getState().sendMessage({ content: "Hi", privateMode: true })).toBe(true);
    expect(JSON.parse(socket.send.mock.calls[0][0]).private).toBe(true);
    socket.handlers.onDelta("Hello\nCONFIDENCE: 80%");
    socket.handlers.onDone({ content: "Hello", memory_receipt: { used: [] }, message_id: "real-message" });
    expect(useChatStore.getState().messages.at(-1).content).toBe("Hello");
    expect(useChatStore.getState().messages.at(-1).id).toBe("real-message");
  });

  it("clears user memory and disconnects on logout", () => {
    useChatStore.getState()._connectSocket("chat");
    useChatStore.setState({ memories: [{ id: "sensitive", fact: "private" }], memoryTotal: 1 });
    window.dispatchEvent(new Event("auth:logout"));
    expect(useChatStore.getState().memories).toEqual([]);
    expect(useChatStore.getState().socket).toBeNull();
    expect(mocks.sockets[0].close).toHaveBeenCalled();
  });

  it("does not restore an old user's facts after a late HTTP response", async () => {
    let resolve;
    mocks.getAll.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = useChatStore.getState().fetchMemories();
    localStorage.setItem("accessToken", "account-two");
    resolve({ data: { memories: [{ fact: "account-one-private" }], total: 1 } });
    await pending;
    expect(useChatStore.getState().memories).toEqual([]);
  });
});
