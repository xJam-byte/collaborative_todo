"use client";

import React, { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { Task, useStore } from '@/lib/store';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    setConnected,
    setTasks,
    setPresence,
    flushQueue,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskDeleted,
    syncTaskReordered,
  } = useStore();

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      flushQueue();
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    // When the server responds to list:join with a WsResponse, NestJS emits it as an event!
    const onListJoined = (data: { list: { tasks: Task[] }; presence: any[] }) => {
      if (data.list?.tasks) {
        setTasks(data.list.tasks);
      }
      if (data.presence) {
        setPresence(data.presence);
      }
    };

    const onTaskCreated = (data: { task: Task; by: any }) => {
      syncTaskCreated(data.task);
    };

    const onTaskUpdated = (data: { task: Task; by: any }) => {
      syncTaskUpdated(data.task);
    };

    const onTaskDeleted = (data: { taskId: string; task: Task; by: any }) => {
      syncTaskDeleted(data.taskId);
    };

    const onTaskReordered = (data: { task: Task; by: any }) => {
      syncTaskReordered(data.task);
    };

    const onUserJoined = (data: { user: any; presence: any[] }) => {
      setPresence(data.presence);
    };

    const onUserLeft = (data: { user: any; presence: any[] }) => {
      setPresence(data.presence);
    };

    const onUserFocusChanged = (data: { user: any; taskId: string; presence: any[] }) => {
      setPresence(data.presence);
    };

    const onError = (data: any) => {
      if (data.requiresConfirmation) {
        if (window.confirm(data.message)) {
          // If confirmed, re-emit delete with forceDelete: true
          socket.emit('task:delete', { taskId: data.taskId, forceDelete: true });
        }
      } else {
        alert('Ошибка: ' + data.message);
        // Force a re-sync to repair any optimistic updates that failed
        socket.emit('list:join', { listId: useStore.getState().currentListId });
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('list:joined', onListJoined);
    socket.on('error', onError);
    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('task:reordered', onTaskReordered);
    socket.on('user:joined', onUserJoined);
    socket.on('user:left', onUserLeft);
    socket.on('user:focus-changed', onUserFocusChanged);

    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('list:joined', onListJoined);
      socket.off('error', onError);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('task:reordered', onTaskReordered);
      socket.off('user:joined', onUserJoined);
      socket.off('user:left', onUserLeft);
      socket.off('user:focus-changed', onUserFocusChanged);
      initialized.current = false;
    };
  }, [setConnected, flushQueue, setTasks, syncTaskCreated, syncTaskUpdated, syncTaskDeleted, syncTaskReordered, setPresence]);

  return <>{children}</>;
};
