import { create } from "zustand";
import api from "../services/api";

const useProjectStore = create((set) => ({
  projects: [],

  fetchProjects: async () => {
    try { const { data } = await api.get("/projects/"); set({ projects: data.projects }); }
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

export default useProjectStore;
