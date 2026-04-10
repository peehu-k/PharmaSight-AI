/**
 * LearningPanel — System learning and feedback
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { getLearningHistory, submitFeedback, type LearningSummary } from '../api/pharmasight';

interface Props {
  currentImageId?: string;
  currentDecision?: string;
}

export default function LearningPanel({ currentImageId, currentDecision }: Props) {
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [humanDecision, setHumanDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []); // Only load once on mount

  const loadSummary = async () => {
    try {
      const data = await getLearningHistory();
      setSummary(data);
    } catch (error) {
      console.error('Failed to load learning summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!currentImageId || !humanDecision) {
      alert('Please select a decision');
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback(currentImageId, humanDecision, notes);
      alert('Feedback submitted successfully!');
      setHumanDecision('');
      setNotes('');
      loadSummary(); // Reload summary
    } catch (error) {
      alert('Failed to submit feedback: ' + (error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="metric-label">LOADING LEARNING DATA...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="metric-label">NO LEARNING DATA AVAILABLE</div>
      </div>
    );
  }

  const getTrendIcon = () => {
    switch (summary.trend) {
      case 'improving':
        return <TrendingUp size={20} className="text-green-400" />;
      case 'degrading':
        return <TrendingDown size={20} className="text-red-400" />;
      default:
        return <Minus size={20} className="text-gray-400" />;
    }
  };

  const getTrendColor = () => {
    switch (summary.trend) {
      case 'improving':
        return '#22c55e';
      case 'degrading':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  // Mock accuracy over time data (in production, this would come from backend)
  const accuracyData = Array.from({ length: Math.min(summary.total_samples, 20) }, (_, i) => ({
    sample: i + 1,
    accuracy: Math.max(40, Math.min(100, summary.ai_accuracy + (Math.random() - 0.5) * 20))
  }));

  // Weight adjustments data
  const weightData = Object.entries(summary.weight_adjustments).map(([name, value]) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    adjustment: value * 100
  }));

  return (
    <div className="space-y-6">
      {/* Stats Row - Enhanced Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-lg glass-card relative overflow-hidden"
        >
          <div className="metric-label mb-2">TOTAL SAMPLES</div>
          <div className="text-5xl font-bold font-mono text-cyan-400 count-up">{summary.total_samples}</div>
          <motion.div
            className="absolute bottom-0 right-0 w-24 h-24 opacity-10"
            style={{ background: 'radial-gradient(circle, #00d4ff, transparent)' }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-5 rounded-lg glass-card relative overflow-hidden"
        >
          <div className="metric-label mb-2">AI ACCURACY</div>
          <div className="text-5xl font-bold font-mono text-green-400 count-up">{summary.ai_accuracy.toFixed(1)}%</div>
          <motion.div
            className="absolute bottom-0 right-0 w-24 h-24 opacity-10"
            style={{ background: 'radial-gradient(circle, #10b981, transparent)' }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 rounded-lg glass-card relative overflow-hidden"
        >
          <div className="metric-label mb-2">RECENT ACCURACY</div>
          <div className="text-5xl font-bold font-mono text-blue-400 count-up">{summary.recent_accuracy.toFixed(1)}%</div>
          <motion.div
            className="absolute bottom-0 right-0 w-24 h-24 opacity-10"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 3, repeat: Infinity, delay: 1 }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-5 rounded-lg glass-card relative overflow-hidden"
        >
          <div className="metric-label mb-2 flex items-center gap-2">
            TREND {getTrendIcon()}
          </div>
          <div className="text-4xl font-bold font-mono capitalize" style={{ color: getTrendColor() }}>
            {summary.trend.replace('_', ' ')}
          </div>
        </motion.div>
      </div>

      {/* Accuracy Over Time Chart */}
      {summary.total_samples >= 5 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-xl glass-card"
        >
          <div className="text-xl font-mono font-semibold mb-6 metric-label">AI ACCURACY OVER TIME</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={accuracyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 212, 255, 0.1)" />
              <XAxis 
                dataKey="sample" 
                tick={{ fill: '#64748b', fontFamily: 'JetBrains Mono' }} 
              />
              <YAxis 
                tick={{ fill: '#64748b', fontFamily: 'JetBrains Mono' }} 
                domain={[0, 100]} 
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(13, 17, 23, 0.95)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  backdropFilter: 'blur(12px)',
                  fontFamily: 'JetBrains Mono'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="accuracy" 
                stroke="#00d4ff" 
                strokeWidth={3} 
                dot={{ fill: '#00d4ff', r: 4 }}
                style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Most Common Error Cause */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="p-6 rounded-xl glass-card"
        style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
      >
        <div className="text-xl font-mono font-semibold mb-3 metric-label">MOST COMMON ERROR CAUSE</div>
        <div className="text-4xl font-bold font-mono text-amber-400 capitalize mb-2">
          {summary.most_common_error_cause.replace('_', ' ')}
        </div>
        <div className="text-sm metric-label">
          OCCURRED IN {summary.error_cause_count} ERROR CASES
        </div>
      </motion.div>

      {/* Weight Adjustments */}
      {weightData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="p-6 rounded-xl glass-card"
        >
          <div className="text-xl font-mono font-semibold mb-6 metric-label">SUGGESTED WEIGHT ADJUSTMENTS</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 212, 255, 0.1)" />
              <XAxis 
                dataKey="name" 
                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Space Grotesk' }} 
                angle={-45} 
                textAnchor="end" 
                height={100} 
              />
              <YAxis tick={{ fill: '#64748b', fontFamily: 'JetBrains Mono' }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(13, 17, 23, 0.95)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  backdropFilter: 'blur(12px)',
                  fontFamily: 'JetBrains Mono'
                }}
              />
              <Bar 
                dataKey="adjustment" 
                fill="#f59e0b" 
                radius={[8, 8, 0, 0]}
                style={{ filter: 'drop-shadow(0 0 4px #f59e0b)' }}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs metric-label mt-4 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)' }}>
            These factors caused errors and should have increased weight in the trust formula
          </div>
        </motion.div>
      )}

      {/* Feedback Form - Enhanced */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="p-6 rounded-xl glass-card"
      >
        <div className="text-xl font-mono font-semibold mb-6 metric-label">SUBMIT FEEDBACK</div>
        
        {currentImageId && currentDecision ? (
          <div className="space-y-5">
            <div className="p-4 rounded-lg" style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
              <div className="text-sm metric-label mb-1">AI DECISION</div>
              <div className="text-cyan-400 font-mono text-lg font-bold">{currentDecision}</div>
            </div>

            <div>
              <label className="text-sm metric-label mb-3 block">HUMAN DECISION</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setHumanDecision('AI_ACCEPTED')}
                  className={`py-4 px-4 rounded-lg transition-all font-mono font-bold text-sm relative overflow-hidden ${
                    humanDecision === 'AI_ACCEPTED'
                      ? 'bg-green-500 text-black border-2 border-green-400'
                      : 'glass-card text-gray-400 hover:text-green-400 hover:border-green-500/50'
                  }`}
                  style={humanDecision === 'AI_ACCEPTED' ? { boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)' } : {}}
                >
                  <CheckCircle size={20} className="inline mb-1" />
                  <div className="mt-1">ACCEPT</div>
                  {humanDecision === 'AI_ACCEPTED' && (
                    <motion.div
                      className="absolute inset-0 bg-green-400 opacity-20"
                      animate={{ scale: [1, 1.5], opacity: [0.2, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </button>
                <button
                  onClick={() => setHumanDecision('AI_CAUTION')}
                  className={`py-4 px-4 rounded-lg transition-all font-mono font-bold text-sm relative overflow-hidden ${
                    humanDecision === 'AI_CAUTION'
                      ? 'bg-amber-500 text-black border-2 border-amber-400'
                      : 'glass-card text-gray-400 hover:text-amber-400 hover:border-amber-500/50'
                  }`}
                  style={humanDecision === 'AI_CAUTION' ? { boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' } : {}}
                >
                  <AlertTriangle size={20} className="inline mb-1" />
                  <div className="mt-1">CAUTION</div>
                  {humanDecision === 'AI_CAUTION' && (
                    <motion.div
                      className="absolute inset-0 bg-amber-400 opacity-20"
                      animate={{ scale: [1, 1.5], opacity: [0.2, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </button>
                <button
                  onClick={() => setHumanDecision('HUMAN_REVIEW')}
                  className={`py-4 px-4 rounded-lg transition-all font-mono font-bold text-sm relative overflow-hidden ${
                    humanDecision === 'HUMAN_REVIEW'
                      ? 'bg-red-500 text-black border-2 border-red-400'
                      : 'glass-card text-gray-400 hover:text-red-400 hover:border-red-500/50'
                  }`}
                  style={humanDecision === 'HUMAN_REVIEW' ? { boxShadow: '0 0 20px rgba(239, 68, 68, 0.5)' } : {}}
                >
                  <XCircle size={20} className="inline mb-1" />
                  <div className="mt-1">REJECT</div>
                  {humanDecision === 'HUMAN_REVIEW' && (
                    <motion.div
                      className="absolute inset-0 bg-red-400 opacity-20"
                      animate={{ scale: [1, 1.5], opacity: [0.2, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm metric-label mb-2 block">NOTES (OPTIONAL)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-4 rounded-lg glass-card text-gray-200 font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                style={{ background: 'rgba(13, 17, 23, 0.8)', borderColor: 'rgba(0, 212, 255, 0.2)' }}
                rows={4}
                placeholder="Add any observations or comments..."
              />
            </div>

            <button
              onClick={handleSubmitFeedback}
              disabled={submitting || !humanDecision}
              className="w-full py-4 rounded-lg font-mono font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #00d4ff, #0ea5e9)',
                color: '#000',
                boxShadow: '0 4px 20px rgba(0, 212, 255, 0.4)'
              }}
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT FEEDBACK'}
            </button>
          </div>
        ) : (
          <div className="text-center py-12 glass-card rounded-lg">
            <div className="metric-label mb-2">NO IMAGE LOADED</div>
            <div className="text-gray-500 text-sm">Upload and inspect an image to provide feedback</div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
