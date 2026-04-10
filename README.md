# PharmaSight - AI-Powered Pharmaceutical Blister Pack Inspection

Advanced quality control system for pharmaceutical blister pack inspection using computer vision and explainable AI.

## Features

- **Real-time Detection**: YOLO-based pill and defect detection
- **Quality Metrics**: Comprehensive image quality analysis (brightness, contrast, sharpness, noise, exposure)
- **Trust Scoring**: Explainable AI trust scores with bottleneck identification
- **Simulation**: What-if analysis for image quality improvements
- **Learning System**: Continuous improvement through human feedback
- **Interactive UI**: Modern React-based interface with real-time visualization

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+
- pip and npm

### Backend Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start backend server
uvicorn backend.main:app --reload --port 8000
```

Backend will be available at `http://localhost:8000`

API docs at `http://localhost:8000/docs`

### Frontend Setup

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Project Structure

```
blister-inspect/
├── backend/
│   ├── main.py                    # FastAPI application
│   ├── quality_analyzer.py        # Image quality metrics
│   ├── trust_engine.py            # Trust score computation
│   ├── recommendation_engine.py   # Actionable recommendations
│   ├── simulation_engine.py       # What-if simulation
│   └── feedback_manager.py        # Learning system
├── frontend/
│   ├── src/
│   │   ├── components/            # React components
│   │   ├── api/                   # API client
│   │   └── App.tsx                # Main application
│   └── package.json
├── model/
│   └── pill_best.pt               # Trained YOLO model
└── requirements.txt               # Python dependencies
```

## API Endpoints

### POST /inspect
Upload and analyze blister pack image
- **Input**: Image file (multipart/form-data)
- **Output**: Detection results, quality metrics, trust score, recommendations

### POST /simulate
Simulate image quality improvements
- **Input**: Image ID + adjustments (brightness, contrast, blur)
- **Output**: Modified image + recomputed metrics

### POST /feedback
Submit human feedback for learning
- **Input**: Image ID + human decision + notes
- **Output**: Feedback stored for model improvement

### GET /learning-summary
Get learning system statistics
- **Output**: Accuracy, trends, weight adjustments

### GET /history
Get inspection history
- **Output**: Recent inspections with trust scores

## Quality Metrics

### Image Quality (0-100 scale)
- **Brightness**: Optimal mid-gray detection
- **Contrast**: Standard deviation analysis
- **Sharpness**: Adaptive Laplacian variance
- **Noise**: Median blur residual (brightness-normalized)
- **Exposure**: Over/underexposure detection
- **Centering**: Object position analysis

### Detection Quality
- **Detection Confidence**: sqrt-area weighted with penalties
- **Missing Detection Penalty**: Nonlinear collapse for incomplete packs

### Trust Score (0-100 scale)
- Geometric mean of quality factors
- Weak factor penalty for low scores
- Harmonic mean with detection confidence
- Sigmoid transformation for smooth 0-1 mapping

## Trust Decisions

- **≥75**: AI_ACCEPT (Green) - High confidence, automated approval
- **≥50**: AI_CAUTION (Amber) - Moderate confidence, review recommended
- **<50**: HUMAN_REVIEW (Red) - Low confidence, manual inspection required

## Explainability

Weighted bottleneck identification:
- Sharpness: 25% weight
- Noise: 20% weight
- Exposure: 20% weight
- Centering: 15% weight
- Contrast: 10% weight
- Brightness: 10% weight

Nonlinear drag formula amplifies impact of very low scores.

## Simulation

Test image quality improvements before hardware changes:
- Adjust brightness (-50 to +50)
- Adjust contrast (-50 to +50)
- Apply blur (0 to 10 sigma)

Full pipeline recomputation on modified image.

## Testing

```bash
# Run edge case validation
python test_edge_cases.py

# Run trust & explainability tests
python test_trust_explainability.py

# Run exact metrics tests
python test_exact_metrics.py

# Evaluate model performance
python evaluate_model.py
```

## Model Evaluation

Comprehensive model evaluation with metrics and visualizations:

```bash
# Install evaluation dependencies
pip install -r requirements_eval.txt

# Run evaluation
python evaluate_model.py
```

**Metrics Included:**
- Accuracy, Precision, Recall, F1 Score
- mAP@50, mAP@50-95
- Confusion Matrix
- Inference Speed (FPS)
- Training Curves

**Output:**
- `evaluation_results/evaluation_report.md` - Detailed analysis
- `evaluation_results/training_curves.png` - Visualizations
- `evaluation_results/inference_speed.png` - Speed analysis

See [EVALUATION_GUIDE.md](EVALUATION_GUIDE.md) for detailed documentation.

## Development

### Backend Development
```bash
# Run with auto-reload
uvicorn backend.main:app --reload --port 8000

# Run tests
pytest
```

### Frontend Development
```bash
cd frontend

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Technology Stack

### Backend
- FastAPI - Modern Python web framework
- OpenCV - Computer vision
- Ultralytics YOLO - Object detection
- NumPy - Numerical computing
- Pydantic - Data validation

### Frontend
- React 18 - UI framework
- TypeScript - Type safety
- Vite - Build tool
- Framer Motion - Animations
- Recharts - Data visualization
- Lucide React - Icons

## Model Training

The YOLO model is trained on pharmaceutical blister pack images with two classes:
- Class 0: Pill (filled slot)
- Class 1: Empty slot (defect)

Model weights are stored in `runs/detect/train/weights/best_final.pt`

## Configuration

### Backend Configuration
Edit `backend/main.py` for:
- Model path
- Class IDs
- API settings

### Frontend Configuration
Edit `frontend/src/api/pharmasight.ts` for:
- API base URL
- Request timeouts

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For issues and questions, please open a GitHub issue.

## Acknowledgments

Built with modern AI and computer vision technologies for pharmaceutical quality control.
