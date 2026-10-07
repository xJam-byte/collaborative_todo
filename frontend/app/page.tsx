"use client";

import React, { useEffect, useState } from "react";
import { TodoList } from "@/components/TodoList";
import { useStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";

export default function ListPage() {
  const isConnected = useStore((state) => state.isConnected);
  const presence = useStore((state) => state.presence);
  const [listId, setListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      connectSocket();
      fetchListId(token);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchListId = async (token: string) => {
    try {
      const listsRes = await fetch("http://localhost:3000/api/lists", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listsRes.ok) {
        const lists = await listsRes.json();
        if (lists.length > 0) {
          const sharedList =
            lists.find((l: any) => l.members?.length > 1) || lists[0];
          setListId(sharedList.id);
        } else {
          setError("У вас нет списков задач.");
        }
      } else if (listsRes.status === 401) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userEmail");
        setLoading(false);
        return;
      } else {
        setError("Ошибка загрузки списков.");
      }
    } catch (e) {
      console.warn(e);
      setError("Не удалось подключиться к серверу.");
    } finally {
      setLoading(false);
    }
  };

  const loginAs = async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const loginRes = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      });

      if (!loginRes.ok) throw new Error("Login failed");
      const { accessToken } = await loginRes.json();
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("userEmail", email);
      window.location.reload();
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Ошибка авторизации. Проверьте запущен ли бэкенд.");
      setLoading(false);
    }
  };

  const logout = () => {
    disconnectSocket();
    localStorage.removeItem("accessToken");
    localStorage.removeItem("userEmail");
    useStore.getState().setTasks([]);
    useStore.getState().setPresence([]);
    setListId(null);
    setLoading(false);
    setError(null);
  };

  const currentUser =
    typeof window !== "undefined" ? localStorage.getItem("userEmail") : "";

  const onlineUsers = presence.filter((p) => p.user.email !== currentUser);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-black dark:text-white">
        <div className="flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          Авторизация...
        </div>
      </div>
    );
  }

  if (!listId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 dark:bg-black dark:text-white">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/20 mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-2xl font-bold mb-2">SyncList</h1>
          <p className="text-gray-500">
            Совместный список задач в реальном времени
          </p>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 w-64">
          <button
            onClick={() => loginAs("alice@example.com")}
            className="px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium shadow-lg shadow-blue-500/20"
          >
            👩 Войти как Alice (Admin)
          </button>
          <button
            onClick={() => loginAs("bob@example.com")}
            className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors font-medium shadow-lg shadow-emerald-500/20"
          >
            👨 Войти как Bob (Member)
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-200 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
              ✓
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SyncList</h1>
              <span className="text-xs text-gray-500">{currentUser}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Online users */}
            {onlineUsers.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm">
                {onlineUsers.map((u) => (
                  <span key={u.socketId} className="font-medium">
                    {u.user.name}
                  </span>
                ))}
                <span>тоже здесь</span>
              </div>
            )}

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                isConnected
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
              ></div>
              {isConnected ? "В сети" : "Офлайн"}
            </div>

            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors"
            >
              Выйти
            </button>
          </div>
        </header>

        <TodoList listId={listId} />
      </div>
    </main>
  );
}
