#!/usr/bin/env python3
"""dsh-jupyter kernel bridge.

A long-lived Jupyter kernel session driven over JSONL stdio. The dsh host
spawns one instance per notebook file; requests arrive as one JSON object per
line on stdin, events go out one JSON object per line on stdout.

Requests (op):
  execute   {op, id, code}              run code in the shared kernel
  interrupt {op, id}                    interrupt the running execution
  restart   {op, id}                    restart the kernel (fresh state)
  shutdown  {op}                        stop the kernel and exit

Events (type):
  ready    {type, kernel}               kernel is up and accepting work
  output   {type, id, output}           one nbformat output (streaming)
  done     {type, id, execution_count, status}  execution finished
  log      {type, message}              diagnostics
  error    {type, id, message}          fatal request failure

Design notes:
  * stdin is consumed by a reader thread into a queue so the iopub pump never
    blocks on requests (interrupt must land while a cell is running).
  * iopub messages are filtered to the current execute's parent msg_id and
    converted to nbformat 4 output dicts; execute_input carries the execution
    count. A status idle message ends the pump.
  * select() over stdin handles the "kernel finished but bridge input idle"
    case without busy loops.
"""

import json
import os
import queue
import select
import sys
import threading
import traceback

from jupyter_client import KernelManager


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def log(message: str) -> None:
    emit({"type": "log", "message": message})


def convert_iopub(msg: dict) -> dict | None:
    """Convert one iopub message into an nbformat 4 output dict (None when skippable)."""
    mtype = msg["msg_type"]
    content = msg["content"]
    if mtype == "stream":
        return {"output_type": "stream", "name": content.get("name", "stdout"), "text": content.get("text", "")}
    if mtype in ("execute_result", "display_data"):
        return {
            "output_type": mtype,
            "execution_count": content.get("execution_count"),
            "data": content.get("data", {}),
            "metadata": content.get("metadata", {}),
        }
    if mtype == "error":
        return {
            "output_type": "error",
            "ename": content.get("ename", "Error"),
            "evalue": content.get("evalue", ""),
            "traceback": content.get("traceback", []),
        }
    return None


class Bridge:
    def __init__(self, kernel_name: str, cwd: str) -> None:
        self.kernel_name = kernel_name
        self.cwd = cwd
        self.km: KernelManager | None = None
        self.kc = None
        self.requests: queue.Queue = queue.Queue()

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self.km = KernelManager(kernel_name=self.kernel_name)
        self.km.start_kernel(cwd=self.cwd)
        self.kc = self.km.client()
        self.kc.start_channels()
        try:
            self.kc.wait_for_ready(timeout=60)
        except Exception as exc:  # noqa: BLE001 -- report any readiness failure
            raise RuntimeError(f"kernel {self.kernel_name} not ready: {exc}") from exc

    def restart(self) -> None:
        assert self.km is not None
        self.km.restart_kernel(now=True)
        self.kc = self.km.client()
        self.kc.start_channels()
        try:
            self.kc.wait_for_ready(timeout=60)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"kernel restart failed: {exc}") from exc

    def shutdown(self) -> None:
        try:
            if self.kc is not None:
                self.kc.stop_channels()
        except Exception:  # noqa: BLE001 -- best-effort teardown
            pass
        try:
            if self.km is not None:
                self.km.shutdown_kernel(now=True)
        except Exception:  # noqa: BLE001
            pass

    # -- execution ---------------------------------------------------------

    def execute(self, req_id: str, code: str) -> None:
        assert self.kc is not None
        execution_count: int | None = None
        status = "ok"
        try:
            msg_id = self.kc.execute(code)
            while True:
                try:
                    msg = self.kc.get_iopub_msg(timeout=0.1)
                except queue.Empty:
                    # Kernel may have died under a long-running cell; re-check.
                    if self.km is not None and not self.km.is_alive():
                        raise RuntimeError("kernel died during execution")
                    continue
                if msg["parent_header"].get("msg_id") != msg_id:
                    continue
                mtype = msg["msg_type"]
                content = msg["content"]
                if mtype == "status":
                    if content.get("execution_state") == "idle":
                        break
                    continue
                if mtype == "execute_input":
                    execution_count = content.get("execution_count")
                    continue
                output = convert_iopub(msg)
                if output is not None:
                    emit({"type": "output", "id": req_id, "output": output})
            # The authoritative outcome is the shell reply (ok/error/aborted).
            try:
                reply = self.kc.get_shell_msg(timeout=1)
                if reply["parent_header"].get("msg_id") == msg_id:
                    reply_status = reply["content"].get("status")
                    if reply_status in ("error", "aborted"):
                        status = "error"
            except queue.Empty:
                pass  # reply lost; keep the iopub-derived ok
        except Exception as exc:  # noqa: BLE001 -- report and finish the request
            status = "error"
            emit({"type": "error", "id": req_id, "message": str(exc)})
        emit({
            "type": "done",
            "id": req_id,
            "execution_count": execution_count,
            "status": status,
        })

    def interrupt(self) -> None:
        try:
            if self.km is not None:
                self.km.interrupt_kernel()
        except Exception as exc:  # noqa: BLE001
            emit({"type": "log", "message": f"interrupt failed: {exc}"})

    # -- main loop ---------------------------------------------------------

    def run(self) -> None:
        while True:
            try:
                req = self.requests.get(timeout=0.1)
            except queue.Empty:
                continue
            op = req.get("op")
            req_id = str(req.get("id", ""))
            if op == "shutdown":
                return
            try:
                if op == "execute":
                    self.execute(req_id, str(req.get("code", "")))
                elif op == "interrupt":
                    self.interrupt()
                elif op == "restart":
                    self.restart()
                    emit({"type": "ready", "kernel": self.kernel_name})
                else:
                    emit({"type": "error", "id": req_id, "message": f"unknown op {op}"})
            except Exception as exc:  # noqa: BLE001
                emit({"type": "error", "id": req_id, "message": str(exc)})
                log(traceback.format_exc())


def reader_thread(bridge: Bridge) -> None:
    for line in sys.stdin:
        line = line.strip()
        if line == "":
            continue
        try:
            bridge.requests.put(json.loads(line))
        except json.JSONDecodeError:
            emit({"type": "log", "message": "bad request line ignored"})


def main() -> None:
    kernel_name = "python3"
    cwd = os.getcwd()
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--kernel" and i + 1 < len(args):
            kernel_name = args[i + 1]
        elif arg == "--cwd" and i + 1 < len(args):
            cwd = args[i + 1]
    bridge = Bridge(kernel_name, cwd)
    try:
        bridge.start()
        emit({"type": "ready", "kernel": kernel_name})
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "id": "", "message": f"bridge start failed: {exc}"})
        log(traceback.format_exc())
        return
    threading.Thread(target=reader_thread, args=(bridge,), daemon=True).start()
    bridge.run()
    bridge.shutdown()


if __name__ == "__main__":
    main()
