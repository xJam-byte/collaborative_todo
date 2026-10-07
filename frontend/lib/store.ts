import { create } from 'zustand';
import { getSocket } from './socket';

export interface Task {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  position: string;
  version: number;
  creatorId: string;
  creator?: { id: string; email: string; name: string };
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserPresence {
  user: { id: string; email: string; name: string };
  socketId: string;
  focusedTaskId: string | null;
  joinedAt: string;
}

type ActionPayload =
  | { type: 'CREATE_TASK'; payload: { text: string; listId: string } }
  | { type: 'UPDATE_TASK'; payload: { taskId: string; text?: string; completed?: boolean; version?: number } }
  | { type: 'DELETE_TASK'; payload: { taskId: string } };

interface AppState {
  tasks: Task[];
  isConnected: boolean;
  offlineQueue: ActionPayload[];
  presence: UserPresence[];
  currentListId: string | null;
  setConnected: (status: boolean) => void;
  setTasks: (tasks: Task[]) => void;
  setCurrentListId: (id: string) => void;
  addTask: (text: string, listId: string) => void;
  updateTask: (taskId: string, updates: { text?: string; completed?: boolean }, version: number) => void;
  deleteTask: (taskId: string) => void;
  setPresence: (presence: UserPresence[]) => void;
  enqueueAction: (action: ActionPayload) => void;
  flushQueue: () => void;
  // Server sync handlers — apply server-authoritative data
  syncTaskCreated: (task: Task) => void;
  syncTaskUpdated: (task: Task) => void;
  syncTaskDeleted: (taskId: string) => void;
  syncTaskReordered: (task: Task) => void;
}

export const useStore = create<AppState>((set, get) => ({
  tasks: [],
  isConnected: false,
  offlineQueue: [],
  presence: [],
  currentListId: null,

  setConnected: (status) => set({ isConnected: status }),
  setTasks: (tasks) => set({ tasks }),
  setCurrentListId: (id) => set({ currentListId: id }),
  setPresence: (presence) => set({ presence }),

  addTask: (text, listId) => {
    const payload = { text, listId };
    if (!get().isConnected) {
      get().enqueueAction({ type: 'CREATE_TASK', payload });
    } else {
      getSocket().emit('task:create', payload);
    }
    // Don't add locally — wait for server confirmation via task:created event
  },

  updateTask: (taskId, updates, version) => {
    // Optimistic local update
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      ),
    }));
    const payload = { taskId, ...updates, version };
    if (!get().isConnected) {
      get().enqueueAction({ type: 'UPDATE_TASK', payload });
    } else {
      getSocket().emit('task:update', payload);
    }
  },

  deleteTask: (taskId) => {
    // Optimistic local delete
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
    const payload = { taskId };
    if (!get().isConnected) {
      get().enqueueAction({ type: 'DELETE_TASK', payload });
    } else {
      getSocket().emit('task:delete', payload);
    }
  },

  enqueueAction: (action) => {
    set((state) => ({ offlineQueue: [...state.offlineQueue, action] }));
  },

  flushQueue: () => {
    const queue = get().offlineQueue;
    if (queue.length > 0 && get().isConnected) {
      const socket = getSocket();
      queue.forEach((action) => {
        switch (action.type) {
          case 'CREATE_TASK':
            socket.emit('task:create', action.payload);
            break;
          case 'UPDATE_TASK':
            socket.emit('task:update', action.payload);
            break;
          case 'DELETE_TASK':
            socket.emit('task:delete', action.payload);
            break;
        }
      });
      set({ offlineQueue: [] });
    }
  },

  // Server sync: a new task was created (by us or by another user)
  syncTaskCreated: (task) => {
    set((state) => {
      // Avoid duplicates
      if (state.tasks.some((t) => t.id === task.id)) return state;
      return { tasks: [...state.tasks, task] };
    });
  },

  // Server sync: a task was updated
  syncTaskUpdated: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  // Server sync: a task was deleted
  syncTaskDeleted: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  // Server sync: a task was reordered
  syncTaskReordered: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },
}));
