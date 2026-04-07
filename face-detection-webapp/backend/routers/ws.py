"""
WebSocket endpoint — bridges the FaceProcessor progress_queue to connected clients.
"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from routers.jobs import active_processors

router = APIRouter()


@router.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()

    proc = active_processors.get(job_id)
    if not proc:
        await websocket.send_text(json.dumps({"type": "error", "message": "Job not active or not found"}))
        await websocket.close()
        return

    loop = asyncio.get_event_loop()

    try:
        while True:
            # Poll the queue in a non-blocking way so we don't freeze the event loop
            try:
                msg = await loop.run_in_executor(None, _get_with_timeout, proc.progress_queue)
            except _QueueEmpty:
                # Check if the job is still alive
                if proc._thread and not proc._thread.is_alive() and proc.progress_queue.empty():
                    break
                await asyncio.sleep(0.1)
                continue

            await websocket.send_text(json.dumps(msg))

            if msg.get("type") in ("done", "stopped", "error"):
                break

    except WebSocketDisconnect:
        pass


class _QueueEmpty(Exception):
    pass


def _get_with_timeout(q, timeout=0.2):
    import queue
    try:
        return q.get(timeout=timeout)
    except queue.Empty:
        raise _QueueEmpty()
