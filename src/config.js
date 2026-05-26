export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const apiPath = (path) => `${API_URL}${path}`;
