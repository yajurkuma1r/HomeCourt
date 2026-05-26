import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../config';

const SocketContext = createContext(null);
const AUTH_TOKEN_KEY = 'stayclose_auth_token';

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user, activeHouse, refreshHouses } = useAuth();
  const [connected, setConnected] = useState(false);
  const [callParticipants, setCallParticipants] = useState([]);
  const [footprints, setFootprints] = useState([]);
  const [presenceVersion, setPresenceVersion] = useState(0);
  const socketRef = useRef(null);
  const latestHouseIdRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!user || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setCallParticipants([]);
      return undefined;
    }

    const socket = io(API_URL || '/', {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => {
      setConnected(false);
      latestHouseIdRef.current = null; // force rejoin on reconnect
    });
    socket.on('house:presence-updated', ({ houseId }) => {
      if (houseId === latestHouseIdRef.current) {
        setPresenceVersion((version) => version + 1);
      }
    });
    socket.on('house:footprints-updated', ({ houseId, footprints }) => {
      if (houseId === latestHouseIdRef.current) {
        setFootprints(footprints || []);
      }
    });
    socket.on('polaroid:new', () => {
      refreshHouses().catch(() => {});
    });
    socket.on('house:members-updated', ({ houseId }) => {
      if (houseId === latestHouseIdRef.current) {
        setPresenceVersion((version) => version + 1);
        refreshHouses().catch(() => {});
      }
    });
    socket.on('house:kicked', ({ houseId }) => {
      if (houseId === latestHouseIdRef.current) {
        refreshHouses().catch(() => {});
      }
    });
    socket.on('call:participants', ({ houseId, participants }) => {
      if (houseId === latestHouseIdRef.current) {
        setCallParticipants(participants || []);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setCallParticipants([]);
    };
  }, [user?.id]);

  useEffect(() => {
    const socket = socketRef.current;
    const nextHouseId = activeHouse?.id || null;
    const previousHouseId = latestHouseIdRef.current;

    if (!socket || !connected) {
      return;
    }

    if (previousHouseId && previousHouseId !== nextHouseId) {
      socket.emit('house:leave', { houseId: previousHouseId });
      setCallParticipants([]);
    }

    if (nextHouseId && previousHouseId !== nextHouseId) {
      socket.emit('house:join', { houseId: nextHouseId });
    }

    latestHouseIdRef.current = nextHouseId;
  }, [activeHouse?.id, connected]);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      callParticipants,
      footprints,
      presenceVersion
    }),
    [connected, callParticipants, footprints, presenceVersion]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
