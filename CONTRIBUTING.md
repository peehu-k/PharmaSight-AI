# Contributing to PharmaSight

Thank you for your interest in contributing to PharmaSight! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/pharmasight.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit your changes: `git commit -m "Add your feature"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Open a Pull Request

## Development Setup

### Backend
```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Code Style

### Python
- Follow PEP 8 style guide
- Use type hints where appropriate
- Add docstrings to functions and classes
- Keep functions focused and small

### TypeScript/React
- Use TypeScript for type safety
- Follow React best practices
- Use functional components with hooks
- Keep components small and reusable

## Testing

Before submitting a PR, ensure all tests pass:

```bash
# Backend tests
python test_edge_cases.py
python test_trust_explainability.py
python test_exact_metrics.py

# Frontend tests
cd frontend
npm run test
```

## Pull Request Guidelines

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what changes you made and why
3. **Tests**: Include tests for new features
4. **Documentation**: Update README.md if needed
5. **Code Quality**: Ensure no linting errors

## Reporting Issues

When reporting issues, please include:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Environment details (OS, Python version, Node version)

## Feature Requests

We welcome feature requests! Please:
- Check if the feature already exists
- Provide a clear use case
- Explain the expected behavior
- Consider implementation complexity

## Code Review Process

1. All PRs require at least one review
2. Address review comments promptly
3. Keep PRs focused on a single feature/fix
4. Rebase on main before merging

## Areas for Contribution

- **Model Training**: Improve YOLO detection accuracy
- **Metrics**: Add new quality metrics
- **UI/UX**: Enhance user interface
- **Documentation**: Improve guides and examples
- **Testing**: Add more test coverage
- **Performance**: Optimize processing speed

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for contributing to PharmaSight!
