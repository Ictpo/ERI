"""Correspondence analysis core: SVD of standardized residuals."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import LinearOperator, svds

from ..errors import AppError

# Sparse tables with more cells than this get a truncated, matrix-free SVD of
# only the leading `n_axes` axes, so the dense residual matrix is never built.
# Smaller tables (and AFC's dense tables) take the exact dense SVD below.
# The threshold keeps real interview corpora (e.g. 44 interviews, 95k words,
# even at min_freq 1: ~3,000 segments x 3,000 forms = 9M cells) on the exact
# path, so their CHD classes match earlier versions exactly. The two paths
# agree to ~1e-13 but may orient an axis with the opposite sign, and CHD's cut
# scan is not sign-symmetric, so crossing the threshold can change classes.
DENSE_SVD_MAX_CELLS = 12_000_000


@dataclass
class CAResult:
    row_coords: np.ndarray      # (r, k)
    col_coords: np.ndarray      # (c, k)
    row_mass: np.ndarray
    col_mass: np.ndarray
    row_contrib: np.ndarray     # (r, k) contribution fractions per axis
    col_contrib: np.ndarray
    explained: np.ndarray       # fraction of inertia per axis


def _leading_svd(Q: sparse.csr_array, sr: np.ndarray, sc: np.ndarray, k: int):
    """Top-k singular triples of S = Q - sr scᵀ without forming S.

    Q is the sparse matrix P / sqrt(r cᵀ); sr = sqrt(r), sc = sqrt(c)."""

    def matvec(v):
        v = np.ravel(v)
        return Q @ v - sr * (sc @ v)

    def rmatvec(u):
        u = np.ravel(u)
        return Q.T @ u - sc * (sr @ u)

    S = LinearOperator(Q.shape, matvec=matvec, rmatvec=rmatvec, dtype=np.float64)
    v0 = np.random.default_rng(0).standard_normal(min(Q.shape))  # fixed start: deterministic
    U, sv, Vt = svds(S, k=k, v0=v0)
    order = np.argsort(sv)[::-1]  # svds returns ascending order
    return U[:, order], sv[order], Vt[order, :]


def correspondence_analysis(N: np.ndarray | sparse.sparray, n_axes: int = 3) -> CAResult:
    """CA of a non-negative contingency table N (rows x cols), dense or scipy.sparse."""
    if sparse.issparse(N):
        N = sparse.csr_array(N, dtype=np.float64)
    else:
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
    truncated = (sparse.issparse(Nk) and Nk.shape[0] * Nk.shape[1] > DENSE_SVD_MAX_CELLS
                 and min(Nk.shape) > 2 * n_axes + 1)
    if sparse.issparse(Nk) and not truncated:
        Nk = Nk.toarray()

    total = Nk.sum()
    P = Nk / total
    r = P.sum(axis=1)
    c = P.sum(axis=0)
    if truncated:
        # S = (P - r cᵀ) / sqrt(r cᵀ) = Q - sqrt(r) sqrt(c)ᵀ with Q sparse,
        # and ΣS² = ΣQ² - 1 because P, r and c each sum to 1.
        sr, sc = np.sqrt(r), np.sqrt(c)
        Q = (sparse.diags_array(1.0 / sr) @ P @ sparse.diags_array(1.0 / sc)).tocsr()
        U, sv, Vt = _leading_svd(Q, sr, sc, n_axes)
        total_inertia = float(Q.multiply(Q).sum()) - 1.0
    else:
        E = np.outer(r, c)
        S = (P - E) / np.sqrt(E)
        U, sv, Vt = np.linalg.svd(S, full_matrices=False)
        total_inertia = (S**2).sum()
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
