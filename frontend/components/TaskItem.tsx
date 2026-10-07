"use client";

import React, { useState, useEffect } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Check, Trash2, GripVertical, AlertTriangle } from "lucide-react";
import { Task, useStore } from "@/lib/store";

interface TaskItemProps {
  task: Task;
  isEditingByOther: string | null;
  onEditStart: () => void;
  onEditEnd: () => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  isEditingByOther,
  onEditStart,
  onEditEnd,
}) => {
  const { updateTask, deleteTask } = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const [localText, setLocalText] = useState(task.text);
  const [isEditing, setIsEditing] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    if (!isEditing) {
      setLocalText(task.text);
    }
  }, [task.text, isEditing]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalText(e.target.value);
  };

  const handleFocus = () => {
    setIsEditing(true);
    onEditStart();
  };

  const handleBlur = () => {
    setIsEditing(false);
    onEditEnd();
    if (localText !== task.text) {
      updateTask(task.id, { text: localText }, task.version);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleToggleComplete = () => {
    updateTask(task.id, { completed: !task.completed }, task.version);
  };

  const handleDelete = () => {
    if (task.completed) {
      if (
        !window.confirm(
          "Эта задача выполнена. Для удаления нужно сначала снять отметку, либо подтвердите принудительное удаление.",
        )
      ) {
        return;
      }
    }
    if (isEditingByOther) {
      if (
        !window.confirm(
          `Внимание: Пользователь ${isEditingByOther} сейчас редактирует эту задачу. Вы уверены, что хотите её удалить?`,
        )
      ) {
        return;
      }
    }
    deleteTask(task.id);
  };

  return (
    <Reorder.Item
      value={task}
      id={task.id}
      dragListener={false}
      dragControls={dragControls}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative flex items-center gap-3 p-3 mb-2 rounded-xl transition-all border ${
        task.completed
          ? "bg-gray-50/50 border-gray-100 dark:bg-gray-800/20 dark:border-gray-800"
          : "bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 shadow-sm"
      } ${isEditingByOther ? "ring-2 ring-blue-300 dark:ring-blue-600" : ""}`}
    >
      <div
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        onPointerDown={(e) => dragControls.start(e)}
      >
        <GripVertical size={20} />
      </div>

      <button
        onClick={handleToggleComplete}
        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          task.completed
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-gray-300 hover:border-emerald-500 dark:border-gray-600"
        }`}
      >
        {task.completed && <Check size={14} strokeWidth={3} />}
      </button>

      <div className="flex-grow relative">
        <input
          type="text"
          value={localText}
          onChange={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`w-full bg-transparent outline-none transition-all ${
            task.completed
              ? "text-gray-400 line-through"
              : "text-gray-900 dark:text-gray-100"
          }`}
          placeholder="Текст задачи..."
        />

        {task.creator && (
          <div className="text-xs text-gray-400 mt-0.5">
            от {task.creator.name}
          </div>
        )}

        {isEditingByOther && (
          <div className="absolute -bottom-5 left-0 flex items-center gap-1 text-xs text-blue-500 font-medium animate-pulse">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            {isEditingByOther} редактирует...
          </div>
        )}
      </div>

      <div
        className={`flex items-center gap-2 opacity-0 transition-opacity ${isHovered ? "opacity-100" : ""}`}
      >
        {isEditingByOther && (
          <div
            className="text-amber-500"
            title="Редактируется другим пользователем"
          >
            <AlertTriangle size={18} />
          </div>
        )}
        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </Reorder.Item>
  );
};
