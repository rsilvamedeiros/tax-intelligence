'use client';
import { createContext } from 'react';
export const SessionExpiryContext = createContext<() => void>(() => {});
