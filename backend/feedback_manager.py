"""
PharmaSight — Feedback Manager
===============================
Stores and analyzes human feedback for adaptive learning.
"""

import json
from pathlib import Path
from typing import Dict, List
from datetime import datetime
import numpy as np


class FeedbackManager:
    """Manages feedback storage and learning analysis."""
    
    def __init__(self, storage_dir: str = None):
        """
        Initialize feedback manager.
        
        Args:
            storage_dir: Directory to store feedback files
        """
        if storage_dir is None:
            storage_dir = Path(__file__).parent / "feedback_store"
        
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        
        self.feedback_file = self.storage_dir / "feedback.json"
        self.weights_file = self.storage_dir / "weights.json"
        
        # Initialize files if they don't exist
        if not self.feedback_file.exists():
            self._save_json(self.feedback_file, [])
        
        if not self.weights_file.exists():
            self._save_json(self.weights_file, self._get_default_weights())
    
    def store_feedback(
        self,
        image_id: str,
        ai_decision: str,
        human_decision: str,
        quality_metrics: Dict,
        trust_score: float,
        notes: str = ""
    ) -> Dict:
        """Store feedback entry."""
        feedback_entry = {
            "image_id": image_id,
            "timestamp": datetime.now().isoformat(),
            "ai_decision": ai_decision,
            "human_decision": human_decision,
            "quality_metrics": quality_metrics,
            "trust_score": trust_score,
            "notes": notes,
            "ai_correct": ai_decision == human_decision
        }
        
        # Load existing feedback
        feedback_list = self._load_json(self.feedback_file)
        feedback_list.append(feedback_entry)
        
        # Save updated feedback
        self._save_json(self.feedback_file, feedback_list)
        
        return feedback_entry
    
    def load_all_feedback(self) -> List[Dict]:
        """Load all stored feedback entries."""
        return self._load_json(self.feedback_file)
    
    def compute_weight_adjustments(self) -> Dict:
        """
        Analyze feedback history and suggest weight adjustments.
        
        Returns:
            Dict with suggested weight changes
        """
        feedback_list = self.load_all_feedback()
        
        if len(feedback_list) < 5:
            return {
                "message": "Insufficient feedback data (need at least 5 samples)",
                "adjustments": {}
            }
        
        # Analyze last 20 entries
        recent = feedback_list[-20:]
        
        # Find patterns where AI was wrong
        errors = [f for f in recent if not f["ai_correct"]]
        
        if not errors:
            return {
                "message": "No errors in recent feedback",
                "adjustments": {}
            }
        
        # Analyze which metrics were problematic in errors
        metric_issues = {
            "blur_score": [],
            "brightness": [],
            "contrast": [],
            "detection_confidence": []
        }
        
        for error in errors:
            metrics = error.get("quality_metrics", {})
            
            if metrics.get("blur_score", 100) < 40:
                metric_issues["blur_score"].append(1)
            if metrics.get("brightness", 50) < 30 or metrics.get("brightness", 50) > 85:
                metric_issues["brightness"].append(1)
            if metrics.get("contrast", 100) < 35:
                metric_issues["contrast"].append(1)
            if metrics.get("detection_confidence", 100) < 60:
                metric_issues["detection_confidence"].append(1)
        
        # Calculate suggested adjustments (exponential moving average)
        adjustments = {}
        for metric, issues in metric_issues.items():
            if issues:
                error_rate = len(issues) / len(errors)
                if error_rate > 0.3:  # If metric caused >30% of errors
                    # Suggest increasing weight by 5-10%
                    adjustment = min(0.10, error_rate * 0.15)
                    adjustments[metric] = round(adjustment, 3)
        
        return {
            "message": f"Analyzed {len(recent)} recent samples, found {len(errors)} errors",
            "adjustments": adjustments
        }
    
    def get_learning_summary(self) -> Dict:
        """Get learning summary statistics."""
        feedback_list = self.load_all_feedback()
        
        if not feedback_list:
            return {
                "total_samples": 0,
                "ai_accuracy": 0.0,
                "most_common_error_cause": "N/A",
                "weight_adjustments": {},
                "trend": "stable",
                "recent_accuracy": 0.0
            }
        
        total = len(feedback_list)
        correct = sum(1 for f in feedback_list if f["ai_correct"])
        ai_accuracy = (correct / total) * 100 if total > 0 else 0.0
        
        # Recent accuracy (last 10 samples)
        recent = feedback_list[-10:]
        recent_correct = sum(1 for f in recent if f["ai_correct"])
        recent_accuracy = (recent_correct / len(recent)) * 100 if recent else 0.0
        
        # Trend analysis
        if len(feedback_list) >= 20:
            first_half = feedback_list[:len(feedback_list)//2]
            second_half = feedback_list[len(feedback_list)//2:]
            
            first_acc = sum(1 for f in first_half if f["ai_correct"]) / len(first_half) * 100
            second_acc = sum(1 for f in second_half if f["ai_correct"]) / len(second_half) * 100
            
            if second_acc > first_acc + 5:
                trend = "improving"
            elif second_acc < first_acc - 5:
                trend = "degrading"
            else:
                trend = "stable"
        else:
            trend = "insufficient_data"
        
        # Find most common error cause
        errors = [f for f in feedback_list if not f["ai_correct"]]
        error_causes = {"blur": 0, "brightness": 0, "contrast": 0, "confidence": 0}
        
        for error in errors:
            metrics = error.get("quality_metrics", {})
            if metrics.get("blur_score", 100) < 40:
                error_causes["blur"] += 1
            if metrics.get("brightness", 50) < 30:
                error_causes["brightness"] += 1
            if metrics.get("contrast", 100) < 35:
                error_causes["contrast"] += 1
            if metrics.get("detection_confidence", 100) < 60:
                error_causes["confidence"] += 1
        
        most_common = max(error_causes.items(), key=lambda x: x[1]) if errors else ("none", 0)
        
        # Get weight adjustments
        weight_adj = self.compute_weight_adjustments()
        
        return {
            "total_samples": total,
            "ai_accuracy": round(ai_accuracy, 2),
            "most_common_error_cause": most_common[0],
            "error_cause_count": most_common[1],
            "weight_adjustments": weight_adj.get("adjustments", {}),
            "trend": trend,
            "recent_accuracy": round(recent_accuracy, 2)
        }
    
    def _get_default_weights(self) -> Dict:
        """Get default weight configuration."""
        return {
            "blur_score": 0.20,
            "brightness_score": 0.15,
            "contrast_score": 0.10,
            "detection_confidence": 0.15,
            "overexposure_penalty": 0.10,
            "underexposure_penalty": 0.10,
            "object_centering": 0.10,
            "edge_clipping_penalty": 0.05,
            "dynamic_range": 0.05
        }
    
    def _load_json(self, filepath: Path) -> any:
        """Load JSON file."""
        with open(filepath, 'r') as f:
            return json.load(f)
    
    def _save_json(self, filepath: Path, data: any):
        """Save JSON file."""
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
