"""Load the pitwall data layer without requiring an MCP server SDK.

`pitwall` is shipped as a single-file MCP **server script**, not as a library.
Its module body runs ``from mcp.server.fastmcp import FastMCP`` and then builds
a server object, so ``import pitwall`` drags in the entire MCP SDK and fails
hard without it — even though every function we call from it is a plain HTTPS
request against F1's static JSON archive. We are not running a server; we are
reading files.

That mismatch is how a missing package on one machine became "the F1
live-timing archive is unreachable" for two days. `mcp` is a declared dependency
of `f1pitwall`, so a complete install has it — but when an install is partial,
or the SDK later breaks on a new Python, our F1 data disappears and the app
blames Formula 1 for it. A data layer should not have a server framework on its
critical path.

The real SDK is always preferred when it imports. When it doesn't, we install a
stub covering exactly the import-time surface the script touches — a `FastMCP`
whose ``tool()`` returns the function unchanged — so every data helper loads and
behaves identically. Nothing else about pitwall changes, and `mcp.run()` is
never reached because we never call `main()`.

Every ``import pitwall`` in the app goes through :func:`load_pitwall`. It used
to be spelled out at nine call sites, which is why the failure had nine
different shapes and no single place to fix it.
"""
from __future__ import annotations

import sys
import types
from threading import Lock

_lock = Lock()
_module = None


class ArchiveClientUnavailable(RuntimeError):
    """The pitwall client could not be loaded *on this machine*.

    Deliberately distinct from a network error: this one is fixed by an install,
    not by waiting for F1 to come back.
    """


class _StubFastMCP:
    """Enough of FastMCP for the module body to execute, and no more."""

    def __init__(self, *_args, **_kwargs) -> None:
        self.settings = types.SimpleNamespace(host="127.0.0.1", port=0)

    def tool(self, *_args, **_kwargs):
        # @mcp.tool() must return the undecorated function: pitwall's helpers
        # are called directly by us, not through the MCP dispatcher.
        def decorate(fn):
            return fn
        return decorate

    def run(self, *_args, **_kwargs):  # pragma: no cover - never reached
        raise RuntimeError(
            "pitwall's MCP server cannot run here: the mcp package is not installed. "
            "This process only reads F1's data archive.")


def _stub_module(name: str, **attrs) -> types.ModuleType:
    mod = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


def _importable(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:  # noqa: BLE001 - a broken SDK counts as absent
        return False


def _install_mcp_stub() -> bool:
    """Fill in only the MCP submodules that are genuinely missing.

    Returns True if anything was stubbed. A partially working SDK keeps whatever
    parts of it do import — we never shadow a real module with a fake one.
    """
    stubbed = False

    if not _importable("mcp.server.fastmcp"):
        pkg = sys.modules.get("mcp") or _stub_module("mcp")
        server = sys.modules.get("mcp.server") or _stub_module("mcp.server")
        fastmcp = _stub_module("mcp.server.fastmcp", FastMCP=_StubFastMCP)
        # the submodules must also be reachable as attributes, or
        # `from mcp.server.fastmcp import FastMCP` fails on the parent lookup
        pkg.server = server
        server.fastmcp = fastmcp
        stubbed = True

    if not _importable("mcp.types"):
        # only read inside pitwall's optional FastF1 block; without it that block
        # would silently disable half of pitwall's own tool suite
        pkg = sys.modules.get("mcp") or _stub_module("mcp")
        pkg.types = _stub_module("mcp.types", ImageContent=type("ImageContent", (), {}))
        stubbed = True

    return stubbed


def explain_import(exc: Exception) -> str:
    """A sentence that names the fix, not the traceback.

    Shared with the health probe: "probe error — ModuleNotFoundError: No module
    named 'mcp.server.fastmcp'" is a stack-trace fragment shown to an end user,
    and it does not say what to do about it.
    """
    if isinstance(exc, ModuleNotFoundError) and exc.name:
        return (f"the F1 archive client needs the '{exc.name}' package, which isn't "
                "installed here — run: pip install -r backend/requirements.txt")
    return f"the F1 archive client failed to load — {type(exc).__name__}: {exc}"[:200]


def load_pitwall():
    """Return the pitwall module, importing it once per process.

    Raises :class:`ArchiveClientUnavailable` with an actionable message if it
    cannot be loaded at all.
    """
    global _module
    if _module is not None:
        return _module
    with _lock:
        if _module is None:
            _install_mcp_stub()
            try:
                import pitwall
            except Exception as exc:  # noqa: BLE001
                raise ArchiveClientUnavailable(explain_import(exc)) from exc
            _module = pitwall
    return _module


def client_status() -> tuple[bool, str]:
    """(loadable, detail) — for diagnostics that must not raise."""
    try:
        load_pitwall()
    except ArchiveClientUnavailable as exc:
        return False, str(exc)
    return True, "loaded"
