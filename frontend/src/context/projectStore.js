import { sessionEpoch } from "../services/session";
import { create } from "zustand";
import api from "../services/api";

const useProjectStore = create((set) => ({
  projects: [],

  fetchProjects: async () => {
    const epoch = sessionEpoch();
    try { const { data } = await api.get("/projects/"); if (epoch === sessionEpoch()) set({ projects: data.projects }); }
    catch { if (epoch === sessionEpoch()) set({ projects: [] }); }
  },

  createProject: async (projectData) => {
    const epoch = sessionEpoch();
    const { data } = await api.post("/projects/", projectData);
    if (epoch !== sessionEpoch()) return null;
    set(s => ({ projects: [data.project, ...s.projects] }));
    return data.project;
  },

  updateProject: async (id, updates) => {
    const epoch = sessionEpoch();
    const { data } = await api.put(`/projects/${id}`, updates);
    if (epoch !== sessionEpoch()) return null;
    set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...data.project } : p) }));
    return data.project;
  },

  deleteProject: async (id) => {
    const epoch = sessionEpoch();
    await api.delete(`/projects/${id}`);
    if (epoch !== sessionEpoch()) return;
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }));
  },
}));

window.addEventListener("auth:logout", () => useProjectStore.setState({ projects: [] }));

export default useProjectStore;
