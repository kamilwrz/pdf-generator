"""Stable application resource roots, independent of service package depth.

Rendering and readiness share the backend root so moving a workflow module
cannot redirect bundled fonts, template assets or the Alembic configuration.
Resolving these paths performs no database or network operations.
"""
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
