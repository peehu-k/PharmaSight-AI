/**
 * TrustGauge — Animated radial gauge for trust score with color transitions
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  score: number;
  size?: number;
}

export default function TrustGauge({ score, size = 240 }: Props) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  // Color based on score with smooth transitions
  let color = '#ef4444'; // red
  let label = 'CRITICAL';
  let glowClass = 'glow-red';
  
  if (score >= 75) {
    color = '#10b981'; // green
    label = 'OPTIMAL';
    glowClass = 'glow-green';
  } else if (score >= 50) {
    color = '#f59e0b'; // amber
    label = 'CAUTION';
    glowClass = 'glow-amber';
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle with glow */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="16"
          />
          
          {/* Animated progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            className="text-6xl font-bold font-mono"
            style={{ color }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {Math.round(animatedScore)}
          </motion.div>
          <div className="text-xs metric-label mt-1">TRUST SCORE</div>
          <motion.div
            className="text-sm font-bold font-mono mt-2 px-3 py-1 rounded"
            style={{ 
              color,
              background: `${color}20`,
              border: `1px solid ${color}40`
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {label}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
