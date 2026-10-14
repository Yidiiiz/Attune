"""Owns bounded foreground subprocesses and their descendants.

Failure behavior: close the Windows kill-on-close Job or POSIX group on every
exit. Deadlines include stdin delivery; output overflow terminates the process.
Linux parent-death signaling is enabled; abrupt-parent cleanup on other POSIX
systems remains unverified and those systems are refused.
"""
import ctypes
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time


def executable(argv):
    args = list(argv)
    found = shutil.which(args[0])
    if not found:
        raise ValueError(f"executable unavailable: {args[0]}")
    # Never launch an npm .cmd/.ps1 shim through a shell.
    if os.name == "nt" and Path(found).suffix.lower() in (".cmd", ".ps1", ".bat"):
        if Path(found).stem != "codex":
            raise ValueError("configure a native executable instead of a shell launcher")
        entry = Path(found).parent / "node_modules/@openai/codex/bin/codex.js"
        if not entry.is_file():
            raise ValueError("installed Codex JS entrypoint unavailable")
        node = shutil.which("node")
        if not node:
            raise ValueError("node unavailable")
        return [node, str(entry), *args[1:]]
    return [found, *args[1:]]


if os.name == "nt":
    from ctypes import wintypes as wt
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wt.LPCWSTR]
    kernel.CreateJobObjectW.restype = wt.HANDLE
    kernel.SetInformationJobObject.argtypes = [wt.HANDLE, ctypes.c_int, ctypes.c_void_p, wt.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [wt.HANDLE, wt.HANDLE]
    kernel.CloseHandle.argtypes = [wt.HANDLE]
    kernel.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
    kernel.OpenProcess.restype = wt.HANDLE
    kernel.GetProcessTimes.argtypes = [wt.HANDLE, *([ctypes.POINTER(wt.FILETIME)] * 4)]
    kernel.GetExitCodeProcess.argtypes = [wt.HANDLE, ctypes.POINTER(wt.DWORD)]

    class BasicLimits(ctypes.Structure):
        _fields_ = [("process_time", ctypes.c_int64), ("job_time", ctypes.c_int64),
                    ("flags", wt.DWORD), ("min_working", ctypes.c_size_t),
                    ("max_working", ctypes.c_size_t), ("active", wt.DWORD),
                    ("affinity", ctypes.c_size_t), ("priority", wt.DWORD),
                    ("scheduling", wt.DWORD)]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [("basic", BasicLimits), ("io", ctypes.c_uint64 * 6),
                    ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                    ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]


def identity(pid):
    """Birth identity, never just a PID. None means dead; uncertainty raises."""
    if os.name == "nt":
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            if ctypes.get_last_error() == 87:
                return None
            raise OSError("cannot verify process ownership")
        try:
            code = wt.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
                raise ctypes.WinError(ctypes.get_last_error())
            if code.value != 259:
                return None
            times = [wt.FILETIME() for _ in range(4)]
            if not kernel.GetProcessTimes(handle, *[ctypes.byref(t) for t in times]):
                raise ctypes.WinError(ctypes.get_last_error())
            return str((times[0].dwHighDateTime << 32) | times[0].dwLowDateTime)
        finally:
            kernel.CloseHandle(handle)
    try:
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
    except FileNotFoundError:
        return None


class OwnedProcess:
    def __init__(self, argv, cwd, env):
        self.job = None
        if os.name == "nt":
            self.job = kernel.CreateJobObjectW(None, None)
            limits = ExtendedLimits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not self.job or not kernel.SetInformationJobObject(
                    self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                self.close()
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                # Assignment precedes execution, so no descendant can escape in a launch race.
                self.proc = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=0x4 | 0x8000000)
                if not kernel.AssignProcessToJobObject(self.job, int(self.proc._handle)):
                    raise ctypes.WinError(ctypes.get_last_error())
                nt = ctypes.WinDLL("ntdll")
                nt.NtResumeProcess.argtypes = [wt.HANDLE]
                if nt.NtResumeProcess(int(self.proc._handle)) != 0:
                    raise OSError("could not resume owned process")
            except BaseException:
                if hasattr(self, "proc"):
                    self.proc.kill()
                    self.proc.wait()
                self.close()
                raise
        else:
            if sys.platform != "linux":
                raise ValueError("parent-death cleanup supported only on Windows/Linux")
            parent = os.getpid()

            def death_signal():
                libc = ctypes.CDLL(None)
                if libc.prctl(1, signal.SIGKILL) != 0 or os.getppid() != parent:
                    os._exit(125)

            self.proc = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
                preexec_fn=death_signal)

    def close(self):
        if os.name == "nt":
            if self.job:
                kernel.CloseHandle(self.job)
                self.job = None
        elif hasattr(self, "proc"):
            try:
                os.killpg(self.proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


class Allowance:
    def __init__(self, size):
        self.remaining = size
        self.lock = threading.Lock()
        self.overflow = threading.Event()

    def write(self, file, data):
        with self.lock:
            count = min(len(data), self.remaining)
            self.remaining -= count
            file.write(data[:count])
            if count < len(data):
                self.overflow.set()


def run_process(argv, cwd, seconds, allowance, log, stdin=b"", cancelled=lambda: False,
                result=None, result_limit=65536, env=None):
    start = time.monotonic()
    owned = OwnedProcess(executable(argv), cwd, env)
    proc = owned.proc
    failures = []

    def drain(stream):
        try:
            with open(log, "ab", buffering=0) as output:
                while data := stream.read(8192):
                    allowance.write(output, data)
        finally:
            stream.close()

    def feed():
        try:
            proc.stdin.write(stdin)
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass
        finally:
            proc.stdin.close()

    threads = [threading.Thread(target=drain, args=(proc.stdout,)),
               threading.Thread(target=drain, args=(proc.stderr,)), threading.Thread(target=feed)]
    for thread in threads:
        thread.start()
    reason = None
    try:
        while proc.poll() is None:
            if cancelled():
                reason = "cancelled"
            elif time.monotonic() - start >= seconds:
                reason = "deadline"
            elif allowance.overflow.is_set():
                reason = "log allowance exceeded"
            elif result and result.exists() and result.stat().st_size > result_limit:
                reason = "result allowance exceeded"
            if reason:
                break
            time.sleep(0.05)
    finally:
        owned.close()  # also kills surviving children after a successful parent exit
        proc.wait(timeout=10)
        for thread in threads:
            thread.join(timeout=10)
        if any(t.is_alive() for t in threads):
            failures.append("process pipes did not close")
    if allowance.overflow.is_set():
        reason = "log allowance exceeded"
    return {"exit_code": proc.returncode, "reason": reason, "errors": failures,
            "seconds": round(time.monotonic() - start, 2)}
