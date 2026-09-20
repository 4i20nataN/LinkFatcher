/**
 * NavigationContext - Tab and URL selection state.
 * Consumed by 6 components (navigation).
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface NavigationContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedUrl: string;
  setSelectedUrl: (url: string) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('analyze');
  const [selectedUrl, setSelectedUrl] = useState<string>('');

  const value = useMemo(() => ({
    activeTab,
    setActiveTab,
    selectedUrl,
    setSelectedUrl,
  }), [activeTab, selectedUrl]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
