"""
Shared base models and utility types used across multiple domains.
"""

from pydantic import BaseModel


class RefinementFlagsModel(BaseModel):
    """Boolean toggles that drive the refinement prompt builder."""

    smart_cleanup: bool = True
    self_correction: bool = True
    preserve_technical: bool = True
