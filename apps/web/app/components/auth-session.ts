'use client';
import { createContext } from 'react';
export const SessionExpiryContext = createContext<() => void>(() => {});
export const SessionCsrfContext = createContext('');
