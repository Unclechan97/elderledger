"""edge-tts 封装：POST /tts {text, voice?} → audio/mpeg；GET /health"""
import hashlib
import io

import edge_tts
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()
_cache: dict[str, bytes] = {}
MAX_CACHE = 100


class TTSReq(BaseModel):
    text: str
    voice: str = "zh-CN-XiaoxiaoNeural"  # 晓晓：自然、语速适中的普通话女声


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/tts")
async def tts(req: TTSReq):
    key = hashlib.md5(f"{req.voice}|{req.text}".encode()).hexdigest()
    if key in _cache:
        return Response(_cache[key], media_type="audio/mpeg")

    communicate = edge_tts.Communicate(req.text, req.voice)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    data = buf.getvalue()

    if len(_cache) >= MAX_CACHE:
        _cache.clear()
    _cache[key] = data
    return Response(data, media_type="audio/mpeg")
