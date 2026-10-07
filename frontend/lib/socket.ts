import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000/collaboration', {
      auth: {
        token,
      },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
};

export const connectSocket = (): Socket => {
  // If socket exists but has old/wrong token, destroy it and recreate
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  if (socket) {
    // Update auth token
    (socket.auth as Record<string, any>).token = token;
    if (socket.disconnected) {
      socket.connect();
    }
  } else {
    const s = getSocket();
    s.connect();
  }
  
  return getSocket();
};

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};
