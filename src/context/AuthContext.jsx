import React, { createContext, useContext, useEffect, useState } from 'react';
import GlobalLoader from '../components/shared/GlobalLoader';

const AuthContext = createContext();
const AUTH_TOKEN_KEY = 'stayclose_auth_token';

const request = async (path, options = {}) => {
  let res;

  try {
    res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error('Auth server is unavailable. Start `npm run server` and try again.');
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || 'Something went wrong.');
  }

  return data;
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [activeHouse, setActiveHouse] = useState(null);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(true);

  const authedRequest = async (path, options = {}) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      throw new Error('You need to log in first.');
    }

    return request(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  };

  const syncActiveHouse = (nextHouses) => {
    const storedHouse = localStorage.getItem('stayclose_house');

    if (!storedHouse) {
      return;
    }

    try {
      const parsedHouse = JSON.parse(storedHouse);
      const matchingHouse = nextHouses.find((house) => house.id === parsedHouse.id);

      if (matchingHouse) {
        setActiveHouse(matchingHouse);
        localStorage.setItem('stayclose_house', JSON.stringify(matchingHouse));
      } else {
        setActiveHouse(null);
        localStorage.removeItem('stayclose_house');
      }
    } catch (error) {
      console.error('Failed to restore active house', error);
    }
  };

  const refreshHouses = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setHouses([]);
      return [];
    }

    const data = await authedRequest('/api/houses');
    setHouses(data.houses);
    syncActiveHouse(data.houses);
    return data.houses;
  };

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setTimeout(() => {
        setLoading(false);
        setGlobalLoading(false);
      }, 2000);
      return;
    }

    Promise.all([
      request('/api/auth/session', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }),
      new Promise(resolve => setTimeout(resolve, 2000))
    ])
      .then(async ([data]) => {
        setUser(data.user);
        localStorage.setItem('stayclose_user', JSON.stringify(data.user));
        await refreshHouses();
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem('stayclose_user');
        localStorage.removeItem('stayclose_house');
      })
      .finally(() => {
        setLoading(false);
        setGlobalLoading(false);
      });
  }, []);

  const persistAuth = ({ token, user: nextUser }) => {
    setUser(nextUser);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem('stayclose_user', JSON.stringify(nextUser));
    return nextUser;
  };

  const signup = async ({ email, username, password }) => {
    setGlobalLoading(true);
    try {
      const [data] = await Promise.all([
        request('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, username, password })
        }),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);

      setHouses([]);
      const nextUser = persistAuth(data);
      return nextUser;
    } finally {
      setGlobalLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    setGlobalLoading(true);
    try {
      const [data] = await Promise.all([
        request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        }),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);

      const nextUser = persistAuth(data);
      await refreshHouses();
      return nextUser;
    } finally {
      setGlobalLoading(false);
    }
  };

  const updateProfile = async (profileData) => {
    setGlobalLoading(true);
    try {
      const data = await authedRequest('/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify(profileData)
      });
      
      const nextUser = data.user;
      setUser(nextUser);
      localStorage.setItem('stayclose_user', JSON.stringify(nextUser));
      await refreshHouses(); // Refresh houses since user profile data is returned inside house members
      return nextUser;
    } finally {
      setGlobalLoading(false);
    }
  };

  const logout = () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }).catch(() => {});
    }

    setUser(null);
    setActiveHouse(null);
    setHouses([]);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('stayclose_user');
    localStorage.removeItem('stayclose_house');
  };

  const createHouse = async (houseName) => {
    const data = await authedRequest('/api/houses', {
      method: 'POST',
      body: JSON.stringify({ name: houseName })
    });

    const nextHouse = data.house;
    setActiveHouse(nextHouse);
    localStorage.setItem('stayclose_house', JSON.stringify(nextHouse));
    await refreshHouses();
    return nextHouse;
  };

  const joinHouse = async (code) => {
    const data = await authedRequest('/api/houses/join', {
      method: 'POST',
      body: JSON.stringify({ code })
    });

    const nextHouse = data.house;
    setActiveHouse(nextHouse);
    localStorage.setItem('stayclose_house', JSON.stringify(nextHouse));
    await refreshHouses();
    return nextHouse;
  };

  const reopenHouse = async (houseId) => {
    const data = await authedRequest('/api/houses/select', {
      method: 'POST',
      body: JSON.stringify({ houseId })
    });

    const nextHouse = data.house;
    setActiveHouse(nextHouse);
    localStorage.setItem('stayclose_house', JSON.stringify(nextHouse));
    await refreshHouses();
    return nextHouse;
  };

  const renameHouse = async (houseId, newName) => {
    const data = await authedRequest(`/api/houses/${houseId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name: newName })
    });

    const nextHouse = data.house;
    if (activeHouse?.id === houseId) {
      setActiveHouse(nextHouse);
      localStorage.setItem('stayclose_house', JSON.stringify(nextHouse));
    }
    await refreshHouses();
    return nextHouse;
  };

  const leaveHouse = async (houseId) => {
    await authedRequest(`/api/houses/${houseId}/leave`, {
      method: 'POST'
    });
    
    if (activeHouse?.id === houseId) {
      setActiveHouse(null);
      localStorage.removeItem('stayclose_house');
    }
    
    await refreshHouses();
  };

  const updateMemberLocation = async (houseId, coords) => {
    const data = await authedRequest(`/api/houses/${houseId}/location`, {
      method: 'POST',
      body: JSON.stringify(coords)
    });

    const nextHouse = data.house;
    setActiveHouse(nextHouse);
    localStorage.setItem('stayclose_house', JSON.stringify(nextHouse));
    await refreshHouses();
    return nextHouse;
  };

  const getHouseMap = async (houseId) => authedRequest(`/api/houses/${houseId}/map`);

  const getHouseMembers = async (houseId, roomPath = '') =>
    authedRequest(`/api/houses/${houseId}/members${roomPath ? `?room=${encodeURIComponent(roomPath)}` : ''}`);

  const kickHouseMember = async (houseId, memberUserId) =>
    authedRequest(`/api/houses/${houseId}/members/${memberUserId}/kick`, {
      method: 'POST'
    });

  const promoteHouseMember = async (houseId, memberUserId) =>
    authedRequest(`/api/houses/${houseId}/members/${memberUserId}/admin`, {
      method: 'POST'
    });

  const getHouseEvents = async (houseId) => authedRequest(`/api/houses/${houseId}/events`);

  const createHouseEvent = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/events`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const deleteHouseEvent = async (houseId, eventId) =>
    authedRequest(`/api/houses/${houseId}/events/${eventId}`, {
      method: 'DELETE'
    });

  const getHouseCapsules = async (houseId) => authedRequest(`/api/houses/${houseId}/capsules`);

  const createHouseCapsule = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/capsules`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const deleteHouseCapsule = async (houseId, capsuleId) =>
    authedRequest(`/api/houses/${houseId}/capsules/${capsuleId}`, {
      method: 'DELETE'
    });

  const getVault = async (houseId) => authedRequest(`/api/houses/${houseId}/vault`);

  const createVaultFolder = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/vault/folders`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const deleteVaultFolder = async (houseId, folderId) =>
    authedRequest(`/api/houses/${houseId}/vault/folders/${folderId}`, {
      method: 'DELETE'
    });

  const createVaultItem = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/vault/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const deleteVaultItem = async (houseId, itemId) =>
    authedRequest(`/api/houses/${houseId}/vault/items/${itemId}`, {
      method: 'DELETE'
    });

  const getMessages = async (houseId, room = 'general') => authedRequest(`/api/houses/${houseId}/messages?room=${encodeURIComponent(room)}`);

  const sendMessage = async (houseId, payload, room = 'general') =>
    authedRequest(`/api/houses/${houseId}/messages?room=${encodeURIComponent(room)}`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, roomId: room })
    });

  const getSpotifyMediaState = async (houseId) => authedRequest(`/api/houses/${houseId}/media/spotify`);

  const updateSpotifyMediaState = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/media/spotify`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const getYouTubeMediaState = async (houseId) => authedRequest(`/api/houses/${houseId}/media/youtube`);

  const updateYouTubeMediaState = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/media/youtube`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const getHouseCallState = async (houseId) => authedRequest(`/api/houses/${houseId}/call`);

  const updateHouseCallState = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/call`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const getPictionaryGame = async (houseId) => authedRequest(`/api/houses/${houseId}/games/pictionary`);

  const updatePictionaryGame = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/games/pictionary`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const getUnoGame = async (houseId) => authedRequest(`/api/houses/${houseId}/games/uno`);
  const getLudoGame = async (houseId) => authedRequest(`/api/houses/${houseId}/ludo`);

  const updateUnoGame = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/games/uno`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const getTruthDareGame = async (houseId) => authedRequest(`/api/houses/${houseId}/games/truth_dare`);

  const updateTruthDareGame = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/games/truth_dare`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const getShowroomSnaps = async (houseId) => authedRequest(`/api/houses/${houseId}/showroom`);

  const createShowroomSnap = async (houseId, payload) =>
    authedRequest(`/api/houses/${houseId}/showroom`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

  const viewShowroomSnap = async (houseId, snapId) =>
    authedRequest(`/api/houses/${houseId}/showroom/snaps/${snapId}/view`, {
      method: 'POST'
    });

  const getNotebookState = async (houseId) => authedRequest(`/api/houses/${houseId}/notebook`);
  const getStudyNotebookState = async (houseId) => authedRequest(`/api/houses/${houseId}/study-notebook`);

  const value = {
    user,
    activeHouse,
    houses,
    loading,
    login,
    signup,
    logout,
    updateProfile,
    createHouse,
    joinHouse,
    reopenHouse,
    renameHouse,
    leaveHouse,
    refreshHouses,
    updateMemberLocation,
    getHouseMap,
    getHouseMembers,
    kickHouseMember,
    promoteHouseMember,
    getHouseEvents,
    createHouseEvent,
    deleteHouseEvent,
    getHouseCapsules,
    createHouseCapsule,
    deleteHouseCapsule,
    getVault,
    createVaultFolder,
    deleteVaultFolder,
    createVaultItem,
    deleteVaultItem,
    getMessages,
    sendMessage,
    getSpotifyMediaState,
    updateSpotifyMediaState,
    getYouTubeMediaState,
    updateYouTubeMediaState,
    getHouseCallState,
    updateHouseCallState,
    getPictionaryGame,
    updatePictionaryGame,
    getUnoGame,
    updateUnoGame,
    getLudoGame,
    getTruthDareGame,
    updateTruthDareGame,
    getShowroomSnaps,
    createShowroomSnap,
    viewShowroomSnap,
    getNotebookState,
    getStudyNotebookState
  };

  return (
    <AuthContext.Provider value={value}>
      {globalLoading && <GlobalLoader />}
      {!loading && children}
    </AuthContext.Provider>
  );
};
