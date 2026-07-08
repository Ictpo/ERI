"""Correspondence analysis core: SVD of standardized residuals."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..errors import AppError


@dataclass
class CAResult:
    row_coords: np.ndarray      # (r, k)
    col_coords: np.ndarray      # (c, k)
    row_mass: np.ndarray
    col_mass: np.ndarray
    row_contrib: np.ndarray     # (r, k) contribution fractions per axis
    col_contrib: np.ndarray
    explained: np.ndarray       # fraction of inertia per axis


def correspondence_analysis(N: np.ndarray, n_axes: int = 3) -> CAResult:
    """CA of a non-negative contingency table N (rows x cols)."""
    N = np.asarray(N, dtype=np.float64)
    keep_r = N.sum(axis=1) > 0
    keep_c = N.sum(axis=0) > 0
    if keep_r.sum() < 2 or keep_c.sum() < 2:
        raise AppError(
            "degenerate_table",
            "The contingency table is too sparse for factor analysis.",
            "Lower the minimum frequency or include more documents/variables.",
        )
    Nk = N[np.ix_(keep_r, keep_c)]

    total = Nk.sum()
    P = Nk / total
    r = P.sum(axis=1)
    c = P.sum(axis=0)
    E = np.outer(r, c)
    S = (P - E) / np.sqrt(E)

    U, sv, Vt = np.linalg.svd(S, full_matrices=False)
    # Drop numerically-null axes (a perfectly homogeneous table has none left).
    nz = sv > 1e-12
    U, sv, Vt = U[:, nz], sv[nz], Vt[nz, :]
    if sv.size == 0:
        raise AppError(
            "no_variance",
            "The table has no variance: every row has the same profile.",
            "The corpus may be too uniform or too small for this analysis.",
        )
    k = int(min(n_axes, sv.size))
    U, sv, Vt = U[:, :k], sv[:k], Vt[:k, :]

    row_coords = (U * sv) / np.sqrt(r)[:, None]
    col_coords = (Vt.T * sv) / np.sqrt(c)[:, None]
    eig = sv**2
    row_contrib = (r[:, None] * row_coords**2) / eig[None, :]
    col_contrib = (c[:, None] * col_coords**2) / eig[None, :]
    total_inertia = (S**2).sum()
    explained = eig / total_inertia if total_inertia > 0 else eig * 0

    # Re-expand to original indexing (dropped rows/cols get zeros/zero mass).
    def expand(mat, keep, ncols):
        out = np.zeros((keep.size, ncols))
        out[keep] = mat
        return out

    return CAResult(
        row_coords=expand(row_coords, keep_r, k),
        col_coords=expand(col_coords, keep_c, k),
        row_mass=expand(r[:, None], keep_r, 1).ravel(),
        col_mass=expand(c[:, None], keep_c, 1).ravel(),
        row_contrib=expand(row_contrib, keep_r, k),
        col_contrib=expand(col_contrib, keep_c, k),
        explained=explained,
    )
