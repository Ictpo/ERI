"""Human-readable error handling.

Every error leaving the API is an envelope {error: {code, message, hint}} —
no raw stack traces or cryptic matrix-math errors reach the UI.
"""
from __future__ import annotations


class AppError(Exception):
    def __init__(self, code: str, message: str, hint: str | None = None, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        self.status = status

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "hint": self.hint}


def translate_exception(exc: Exception) -> AppError:
    """Map low-level computation errors to actionable messages."""
    if isinstance(exc, AppError):
        return exc
    name = type(exc).__name__
    text = str(exc)
    if "singular" in text.lower() or "SVD did not converge" in text:
        return AppError(
            "numeric_instability",
            "The statistical decomposition failed on this data.",
            "This usually means the corpus is too small or too uniform. "
            "Try lowering the minimum frequency or adding more documents.",
            500,
        )
    if isinstance(exc, MemoryError):
        return AppError(
            "out_of_memory",
            "The corpus is too large for this analysis configuration.",
            "Increase the minimum frequency or reduce the number of terms.",
            500,
        )
    if isinstance(exc, (ValueError, ZeroDivisionError, IndexError)):
        return AppError(
            "computation_error",
            "The analysis could not be completed with these parameters.",
            f"Adjust the parameters and retry. (internal: {name}: {text[:120]})",
            500,
        )
    return AppError(
        "internal_error",
        "An unexpected error occurred while processing the analysis.",
        f"Please retry; if it persists, report this code: {name}.",
        500,
    )
