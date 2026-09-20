/**
 * FavoritesContext - Favorites management.
 * Consumed by 1 component (FavoritesView).
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { FavoriteItem } from '../types';
import { StorageService } from '../core/storage/Storage';

interface FavoritesContextType {
  favorites: FavoriteItem[];
  toggleFavorite: (item: Omit<FavoriteItem, 'dateAdded'>) => boolean;
  updateFavoriteNotes: (id: string, notes: string) => void;
  isFavorite: (url: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(StorageService.getFavorites());

  const toggleFavorite = useCallback((item: Omit<FavoriteItem, 'dateAdded'>): boolean => {
    const added = StorageService.toggleFavorite(item);
    setFavorites(StorageService.getFavorites());
    return added;
  }, []);

  const updateFavoriteNotes = useCallback((id: string, notes: string) => {
    StorageService.updateFavoriteNotes(id, notes);
    setFavorites(StorageService.getFavorites());
  }, []);

  const isFavorite = useCallback((url: string) => {
    return favorites.some(f => f.url === url);
  }, [favorites]);

  const value = useMemo(() => ({
    favorites,
    toggleFavorite,
    updateFavoriteNotes,
    isFavorite,
  }), [favorites, toggleFavorite, updateFavoriteNotes, isFavorite]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
