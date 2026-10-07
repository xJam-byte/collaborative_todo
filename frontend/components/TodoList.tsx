"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Reorder } from "framer-motion";
import { Plus } from "lucide-react";
import { Task, useStore } from "@/lib/store";
import { TaskItem } from "./TaskItem";
import { getSocket } from "@/lib/socket";

interface TodoListProps {
  listId: string;
}

export const TodoList: React.FC<TodoListProps> = ({ listId }) => {
  const { tasks, setTasks, addTask, presence, isConnected } = useStore();
  const [newTaskText, setNewTaskText] = useState("");

  // Join the list room via WebSocket and load tasks from server
  useEffect(() => {
    const socket = getSocket();

    const joinList = () => {
      socket.emit("list:join", { listId });
    };

    if (socket.connected) {
      joinList();
    }

    socket.on("connect", joinList);

    return () => {
      if (socket.connected) {
        socket.emit("list:leave", { listId });
      }
      socket.off("connect", joinList);
    };
  }, [listId, setTasks]);

  const listTasks = tasks
    .filter((t) => t.listId === listId && !t.deletedAt)
    .sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );

  const handleReorder = (reorderedTasks: Task[]) => {
    const updated = reorderedTasks.map((t, index) => ({
      ...t,
    }));

    const otherTasks = tasks.filter((t) => t.listId !== listId);
    setTasks([...otherTasks, ...updated]);

    const socket = getSocket();
    if (socket.connected) {
      reorderedTasks.forEach((task, index) => {
        const prevPos = index > 0 ? reorderedTasks[index - 1].position : null;
        const nextPos =
          index < reorderedTasks.length - 1
            ? reorderedTasks[index + 1].position
            : null;
        if (task.position !== listTasks[index]?.position) {
          const newPos = generatePositionBetween(prevPos, nextPos);
          socket.emit("task:reorder", {
            taskId: task.id,
            newPosition: newPos,
            version: task.version,
          });
        }
      });
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    addTask(newTaskText.trim(), listId);
    setNewTaskText("");
  };

  const getEditor = (taskId: string) => {
    const editor = presence.find((p) => p.focusedTaskId === taskId);
    return editor ? editor.user.email : null;
  };

  const handleEditStart = useCallback(
    (taskId: string) => {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("user:focus", { taskId, listId });
      }
    },
    [listId],
  );

  const handleEditEnd = useCallback(() => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit("user:focus", { taskId: null, listId });
    }
  }, [listId]);

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-6 bg-gray-50/50 dark:bg-gray-900 min-h-[60vh] rounded-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Общий список
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Совместная работа в реальном времени
        </p>
      </div>

      <form onSubmit={handleAddTask} className="mb-8 relative group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Plus
            className="text-gray-400 group-focus-within:text-blue-500 transition-colors"
            size={20}
          />
        </div>
        <input
          type="text"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          placeholder="Добавить новую задачу..."
          className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
        />
      </form>

      <div className="space-y-2">
        <Reorder.Group axis="y" values={listTasks} onReorder={handleReorder}>
          {listTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isEditingByOther={getEditor(task.id)}
              onEditStart={() => handleEditStart(task.id)}
              onEditEnd={handleEditEnd}
            />
          ))}
        </Reorder.Group>

        {listTasks.length === 0 && (
          <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <p className="text-gray-500 dark:text-gray-400">
              Список пока пуст. Добавьте первую задачу!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

function generatePositionBetween(
  before: string | null,
  after: string | null,
): string {
  if (!before && !after) return "n";
  if (!before) return midpoint("", after!);
  if (!after) return midpoint(before, "");
  return midpoint(before, after);
}

function midpoint(a: string, b: string): string {
  const maxLen = Math.max(a.length, b.length, 1);
  const paddedA = a.padEnd(maxLen, "a");
  const paddedB = b ? b.padEnd(maxLen, "z") : "z".repeat(maxLen);

  let result = "";
  let carry = 0;

  for (let i = maxLen - 1; i >= 0; i--) {
    const codeA = paddedA.charCodeAt(i) - 97;
    const codeB = paddedB.charCodeAt(i) - 97;
    const sum = codeA + codeB + carry;
    carry = Math.floor(sum / 26);
    result = String.fromCharCode((Math.floor(sum / 2) % 26) + 97) + result;
  }

  if (result <= a) {
    result = a + "n";
  }

  return result;
}
