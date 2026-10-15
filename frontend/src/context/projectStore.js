import { accessToken, sessionEpoch } from "../services/session";
import { create } from "zustand";
import api from "../services/api";

const useProjectStore = create((set) => ({
  projects: [],

  fetchProjects: async () => {
    const epoch = sessionEpoch();
    try { const { data } = await api.get("/projects/"); if (epoch === sessionEpoch()) set({ projects: data.projects }); }
    catch { set({ projects: [] }); }
  },

  createProject: async (projectData) => {
    const { data } = await api.post("/projects/", projectData);
    set(s => ({ projects: [data.project, ...s.projects] }));
    return data.project;
  },

  updateProject: async (id, updates) => {
    const { data } = await api.put(`/projects/${id}`, updates);
    set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...updates } : p) }));
    return data.project;
  },

  deleteProject: async (id) => {
    await api.delete(`/projects/${id}`);
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }));
  },
}));

window.addEventListener("auth:logout", () => useProjectStore.setState({ projects: [] }));

export default useProjectStore;
