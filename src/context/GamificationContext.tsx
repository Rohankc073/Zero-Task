import React, { createContext, useContext, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';

interface GamificationContextType {
  triggerConfetti: () => void;
}

const GamificationContext = createContext<GamificationContextType>({
  triggerConfetti: () => {},
});

export const useGamification = () => useContext(GamificationContext);

export const GamificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef<any>(null);

  const triggerConfetti = () => {
    setShowConfetti(true);
    // Automatically hide after animation completes to allow re-triggering
    setTimeout(() => {
      setShowConfetti(false);
    }, 4000);
  };

  return (
    <GamificationContext.Provider value={{ triggerConfetti }}>
      {children}
      {showConfetti && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ConfettiCannon
            ref={confettiRef}
            count={200}
            origin={{ x: -10, y: 0 }}
            fadeOut={true}
            fallSpeed={3000}
            explosionSpeed={350}
            colors={['#e1c37a', '#f7f6f2', '#0f141a', '#ffcf54']}
          />
        </View>
      )}
    </GamificationContext.Provider>
  );
};
