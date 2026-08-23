import http.client
import socket
import threading
import time
import webbrowser

import uvicorn


FRONTEND_URL = "https://face-gallery.mrbean.dev/"
HOST = "127.0.0.1"


def _choose_port() -> int:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((HOST, 8000))
            return 8000
        except OSError:
            probe.bind((HOST, 0))
            return probe.getsockname()[1]
    finally:
        probe.close()


def _wait_for_health(port: int, timeout: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            connection = http.client.HTTPConnection("localhost", port, timeout=1)
            connection.request("GET", "/health")
            response = connection.getresponse()
            response.read()
            connection.close()
            if response.status == 200:
                return True
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.2)
    return False


def main() -> None:
    port = _choose_port()
    server = uvicorn.Server(uvicorn.Config("main:app", host=HOST, port=port, log_level="warning"))
    server_thread = threading.Thread(target=server.run, daemon=True)

    print(f"Starting Face Gallery backend on {HOST}:{port}...", flush=True)
    server_thread.start()
    if not _wait_for_health(port):
        server.should_exit = True
        server_thread.join(timeout=5)
        print(f"Backend did not become ready within 30 seconds at http://localhost:{port}/health.", flush=True)
        return

    frontend_url = f"{FRONTEND_URL}?backend=http://localhost:{port}"
    print("Face Gallery backend is ready.", flush=True)
    print(f"Opening {frontend_url}", flush=True)
    webbrowser.open(frontend_url)
    print("Press Ctrl+C in this window to quit.", flush=True)

    try:
        while server_thread.is_alive():
            server_thread.join(timeout=0.5)
    except KeyboardInterrupt:
        print("Stopping Face Gallery backend...", flush=True)
        server.should_exit = True
        server_thread.join(timeout=5)


if __name__ == "__main__":
    main()
