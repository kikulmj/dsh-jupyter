"""Persistent Python kernel bridge for the dsh-jupyter notebook panel.

Standard library only. The bridge owns one Python namespace for the life of
the notebook tab. Cells execute on the main thread (large imports inside a
worker thread deadlock against a blocked stdin reader on Windows); a polling
reader thread accepts requests and injects KeyboardInterrupt into the
executing thread. Requests arrive as JSON lines on stdin; events leave as JSON
lines on a private duplicate of the original stdout, so file-descriptor level
output from the cell (including subprocesses) cannot corrupt the protocol.

Protocol
--------
request  {"op": "execute", "id": "<id>", "code": "<source>"}
request  {"op": "interrupt", "id": "<id>"}
request  {"op": "shutdown"}
event    {"type": "ready"}
event    {"type": "output", "id": "<id>", "output": <nbformat output>}
event    {"type": "done", "id": "<id>", "execution_count": <n>, "status": "ok"|"error"}
event    {"type": "error", "id": "<id>", "message": "<text>"}
"""

from __future__ import annotations

import ast
import base64
import builtins
import ctypes
import io
import json
import os
import queue
import re
import shlex
import subprocess
import sys
import tempfile
import threading
import time
import traceback

# Local helper names must not collide with the cell namespace. Keep them all
# prefixed and remove the module-level globals from the user namespace.
_ORIGINAL_STDOUT_FD = os.dup(1)
_PROTOCOL = os.fdopen(_ORIGINAL_STDOUT_FD, "w", encoding="utf-8", buffering=1)
_PROTOCOL_LOCK = threading.Lock()


def _send(payload: dict) -> None:
    line = json.dumps(payload, ensure_ascii=False)
    with _PROTOCOL_LOCK:
        try:
            _PROTOCOL.write(line + "\n")
            _PROTOCOL.flush()
        except (BrokenPipeError, OSError):
            os._exit(0)


class _Namespace:
    """The user namespace plus helpers kept out of the visible globals."""

    def __init__(self) -> None:
        self.values: dict = {
            "__name__": "__main__",
            "__builtins__": builtins,
            "__doc__": None,
        }
        self.execution_count = 0
        self.current_id: str | None = None
        self.current_thread_ident: int | None = None


_NS = _Namespace()


class _StreamEvent:
    """Output captured from a cell: line-buffered so one print is one event."""

    def __init__(self, request_id: str, name: str) -> None:
        self.request_id = request_id
        self.name = name
        self.pending = ""

    def _emit(self, text: str) -> None:
        if text:
            _send({
                "type": "output",
                "id": self.request_id,
                "output": {"output_type": "stream", "name": self.name, "text": text},
            })

    def write(self, text: str) -> int:
        if text:
            self.pending += text
            if "\n" in self.pending:
                cut = self.pending.rfind("\n") + 1
                self._emit(self.pending[:cut])
                self.pending = self.pending[cut:]
        return len(text)

    def flush(self) -> None:
        self._emit(self.pending)
        self.pending = ""


def _emit_output(request_id: str, output: dict) -> None:
    _send({"type": "output", "id": request_id, "output": output})


def _encode_bytes(value: object, mime: str) -> str | None:
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, bytearray):
        return base64.b64encode(bytes(value)).decode("ascii")
    if isinstance(value, str):
        return value
    return None


def _mimebundle(value: object) -> dict[str, object]:
    """Rich representations for one object (mime -> JSON-safe string)."""
    if value is None:
        return {}
    bundle: dict[str, object] = {}
    custom = getattr(value, "_repr_mimebundle_", None)
    if callable(custom):
        try:
            produced = custom(include=None, exclude=None)
            if isinstance(produced, tuple):
                produced = produced[0]
            if isinstance(produced, dict):
                for mime, payload in produced.items():
                    if isinstance(mime, str):
                        encoded = _encode_bytes(payload, mime)
                        if encoded is not None:
                            bundle[mime] = encoded
                if bundle:
                    return bundle
        except Exception:
            pass
    probes = (
        ("text/html", "_repr_html_"),
        ("text/markdown", "_repr_markdown_"),
        ("text/latex", "_repr_latex_"),
        ("image/svg+xml", "_repr_svg_"),
        ("image/png", "_repr_png_"),
        ("image/jpeg", "_repr_jpeg_"),
    )
    for mime, attribute in probes:
        render = getattr(value, attribute, None)
        if not callable(render):
            continue
        try:
            payload = render()
        except Exception:
            continue
        encoded = _encode_bytes(payload, mime)
        if encoded is not None:
            bundle[mime] = encoded
    render_json = getattr(value, "_repr_json_", None)
    if callable(render_json):
        try:
            payload = render_json()
            if isinstance(payload, tuple):
                payload = payload[0]
            bundle["application/json"] = payload
        except Exception:
            pass
    bundle.setdefault("text/plain", repr(value))
    return bundle


def _emit_value(request_id: str, output_type: str, value: object) -> None:
    if value is None:
        return
    _emit_output(request_id, {
        "output_type": output_type,
        "execution_count": _NS.execution_count if output_type == "execute_result" else None,
        "data": _mimebundle(value),
        "metadata": {},
    })


def _display(*objects: object, **kwargs: object) -> None:
    """A minimal display() for cells; mirrors IPython for rich reprs."""
    request_id = _NS.current_id
    if request_id is None:
        return
    for value in objects:
        _emit_value(request_id, "display_data", value)


def _unsupported_input(*_args: object, **_kwargs: object) -> str:
    raise RuntimeError("input() is not supported in the dsh-jupyter panel")


def _shell(command: str) -> None:
    """Run a shell line (`!cmd`, `%pip ...`) and forward its output."""
    command = command.strip()
    if not command:
        return
    argv: list[str] | None = None
    try:
        parts = shlex.split(command, posix=False)
    except ValueError:
        parts = []
    # posix=False keeps surrounding quotes on Windows; strip them for argv.
    parts = [
        part[1:-1] if len(part) >= 2 and part[0] == part[-1] and part[0] in "\"'" else part
        for part in parts
    ]
    if parts:
        first = parts[0].lower()
        if first in ("pip", "pip3"):
            argv = [sys.executable, "-m", "pip", *parts[1:]]
        elif first in ("python", "python3"):
            argv = [sys.executable, *parts[1:]]
    try:
        if argv is not None:
            finished = subprocess.run(argv, capture_output=True, text=True, errors="replace")
        else:
            finished = subprocess.run(command, shell=True, capture_output=True, text=True, errors="replace")
    except BaseException as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return
    if finished.stdout:
        sys.stdout.write(finished.stdout)
    if finished.stderr:
        sys.stderr.write(finished.stderr)


def _cd(path: str) -> None:
    """`%cd` — change the kernel working directory."""
    target = os.path.expanduser(path.strip() or "~")
    os.chdir(target)
    print(os.getcwd())


def _pwd() -> None:
    """`%pwd` — print the kernel working directory."""
    print(os.getcwd())


_MAGIC_LINE = re.compile(r"^(\s*)(?:!(.*)|%(pip|cd|pwd)\b(.*))$")


def _transform_magics(code: str) -> str:
    """Rewrite IPython line magics into calls, preserving line count."""
    rewritten: list[str] = []
    for line in code.splitlines(keepends=True):
        body = line.rstrip("\r\n")
        ending = line[len(body):]
        matched = _MAGIC_LINE.match(body)
        if matched is None:
            rewritten.append(line)
            continue
        indent = matched.group(1)
        if matched.group(2) is not None:
            call = f"__dsh_shell__({matched.group(2)!r})"
        else:
            name = matched.group(3)
            rest = (matched.group(4) or "").strip()
            if name == "pip":
                call = f"__dsh_shell__({'pip ' + rest!r})"
            elif name == "cd":
                call = f"__dsh_cd__({rest!r})"
            else:
                call = "__dsh_pwd__()"
        rewritten.append(indent + call + ending)
    return "".join(rewritten)


class _BlockedStdin(io.TextIOBase):
    def readable(self) -> bool:
        return True

    def read(self, *_args: object) -> str:
        raise EOFError("stdin is not available to notebook cells")

    def readline(self, *_args: object) -> str:
        raise EOFError("stdin is not available to notebook cells")


def _split_last_expression(tree: ast.Module) -> tuple[ast.Module, ast.Expression | None]:
    body = tree.body
    if not body:
        return tree, None
    last = body[-1]
    if isinstance(last, ast.Expr):
        expression = ast.Expression(last.value)
        ast.copy_location(expression, last.value)
        return ast.Module(body=body[:-1], type_ignores=[]), expression
    return tree, None


def _format_traceback(error: BaseException) -> list[str]:
    """Cell-facing traceback with the bridge's own frames removed."""
    captured = traceback.TracebackException(type(error), error, error.__traceback__)
    captured.stack = traceback.StackSummary.from_list([
        frame for frame in captured.stack
        if not str(frame.filename).replace("\\", "/").endswith("kernel_bridge.py")
    ])
    return [line.replace("\x1b[", "") for line in captured.format()]


def _flush_figure_outputs(request_id: str) -> None:
    pyplot = sys.modules.get("matplotlib.pyplot")
    if pyplot is None:
        return
    try:
        figures = [pyplot.figure(number) for number in pyplot.get_fignums()]
    except Exception:
        return
    for figure in figures:
        try:
            buffer = io.BytesIO()
            figure.savefig(buffer, format="png", bbox_inches="tight")
            payload = base64.b64encode(buffer.getvalue()).decode("ascii")
            _emit_output(request_id, {
                "output_type": "display_data",
                "execution_count": None,
                "data": {"image/png": payload, "text/plain": "<Figure>"},
                "metadata": {},
            })
        except Exception:
            pass
        finally:
            try:
                pyplot.close(figure)
            except Exception:
                pass


def _emit_captured(file, request_id: str, name: str) -> None:
    """Forward output written to a file descriptor during the cell."""
    try:
        file.seek(0)
        data = file.read()
    except OSError:
        return
    if data:
        _emit_output(request_id, {
            "output_type": "stream",
            "name": name,
            "text": data.decode("utf-8", "replace"),
        })


def _run_cell(request_id: str, code: str) -> None:
    _NS.current_id = request_id
    _NS.current_thread_ident = threading.get_ident()

    # Python-level writes stream immediately through the replacement objects.
    # File-descriptor writes (subprocesses, C extensions) go to temporary
    # files and are forwarded once the cell finishes, because a threaded pipe
    # reader deadlocks against a blocked stdin reader on Windows.
    stdout_file = tempfile.TemporaryFile()
    stderr_file = tempfile.TemporaryFile()
    saved_fd_out = os.dup(1)
    saved_fd_err = os.dup(2)
    saved_stdout = sys.stdout
    saved_stderr = sys.stderr
    saved_stdin = sys.stdin
    status = "ok"
    try:
        sys.stdout.flush()
        sys.stderr.flush()
        sys.stdout = _StreamEvent(request_id, "stdout")
        sys.stderr = _StreamEvent(request_id, "stderr")
        sys.stdin = _BlockedStdin()
        os.dup2(stdout_file.fileno(), 1)
        os.dup2(stderr_file.fileno(), 2)

        source = _transform_magics(code)
        try:
            tree = ast.parse(source, filename="<cell>", mode="exec")
        except SyntaxError as error:
            status = "error"
            _emit_output(request_id, {
                "output_type": "error",
                "ename": type(error).__name__,
                "evalue": error.msg,
                "traceback": [line.rstrip("\n") for line in traceback.format_exception_only(type(error), error)],
            })
            return
        body, expression = _split_last_expression(tree)
        exec(compile(tree if expression is None else body, "<cell>", "exec"), _NS.values)
        silent = source.rstrip().endswith(";")
        if expression is not None:
            value = eval(compile(expression, "<cell>", "eval"), _NS.values)
            if not silent:
                _emit_value(request_id, "execute_result", value)
        _flush_figure_outputs(request_id)
    except KeyboardInterrupt:
        status = "error"
        _emit_output(request_id, {
            "output_type": "error",
            "ename": "KeyboardInterrupt",
            "evalue": "Execution interrupted",
            "traceback": ["KeyboardInterrupt: Execution interrupted"],
        })
    except BaseException as error:  # cell errors must never kill the bridge
        status = "error"
        _emit_output(request_id, {
            "output_type": "error",
            "ename": type(error).__name__,
            "evalue": str(error),
            "traceback": _format_traceback(error),
        })
    finally:
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
        os.dup2(saved_fd_out, 1)
        os.dup2(saved_fd_err, 2)
        os.close(saved_fd_out)
        os.close(saved_fd_err)
        sys.stdout = saved_stdout
        sys.stderr = saved_stderr
        sys.stdin = saved_stdin
        _emit_captured(stdout_file, request_id, "stdout")
        _emit_captured(stderr_file, request_id, "stderr")
        stdout_file.close()
        stderr_file.close()
        _NS.current_id = None
        _NS.current_thread_ident = None
        _send({
            "type": "done",
            "id": request_id,
            "execution_count": _NS.execution_count,
            "status": status,
        })


def _interrupt() -> None:
    ident = _NS.current_thread_ident
    if ident is None:
        return
    ctypes.pythonapi.PyThreadState_SetAsyncExc(ctypes.c_ulong(ident), ctypes.py_object(KeyboardInterrupt))


def _install_namespace_helpers() -> None:
    _NS.values["display"] = _display
    _NS.values["input"] = _unsupported_input
    _NS.values["__dsh_shell__"] = _shell
    _NS.values["__dsh_cd__"] = _cd
    _NS.values["__dsh_pwd__"] = _pwd


def _read_requests(requests) -> None:
    """Reader thread: parse stdin JSON lines and serve interrupts inline.

    fd 0 is non-blocking and the loop sleeps between empty reads: a blocking
    pipe read on Windows holds the GIL, which starves the thread executing a
    cell (large imports such as pandas then never finish).

    Requests go to the execution thread through a queue. Interrupts are
    delivered here directly, because the executing thread is the one that must
    keep running; the reader never executes cell code itself.
    """
    try:
        os.set_blocking(0, False)
    except (OSError, ValueError):
        pass
    buffer = b""
    while True:
        try:
            chunk = os.read(0, 65536)
        except BlockingIOError:
            time.sleep(0.01)
            continue
        except OSError:
            requests.put(None)
            return
        if not chunk:
            requests.put(None)
            return
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                continue
            op = request.get("op")
            if op == "interrupt":
                _interrupt()
            elif op == "shutdown":
                requests.put(None)
                return
            else:
                requests.put(request)


def main() -> None:
    cwd = sys.argv[sys.argv.index("--cwd") + 1] if "--cwd" in sys.argv else os.getcwd()
    cwd = os.path.abspath(cwd)
    os.chdir(cwd)
    if cwd not in sys.path:
        sys.path.insert(0, cwd)
    os.environ.setdefault("MPLBACKEND", "Agg")
    _install_namespace_helpers()
    _send({"type": "ready"})

    # Cells run on this thread. A worker thread that imports large modules
    # (pandas/numpy) deadlocks while another thread blocks on stdin on Windows,
    # so the reader is the only background thread and it never imports user
    # code.
    requests = queue.Queue()
    threading.Thread(target=_read_requests, args=(requests,), daemon=True).start()
    while True:
        request = requests.get()
        if request is None:
            return
        op = request.get("op")
        if op != "execute":
            continue
        request_id = str(request.get("id", ""))
        code = request.get("code")
        if not isinstance(code, str):
            _send({"type": "error", "id": request_id, "message": "code must be a string"})
            continue
        _NS.execution_count += 1
        _run_cell(request_id, code)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
