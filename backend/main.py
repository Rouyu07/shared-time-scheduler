from urllib.parse import urlparse
from fastapi import Cookie, Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session
from .auth import cookie_name, matches
from .calendar import google_calendar, ics
from .config import settings
from .database import db_session
from .schemas import AdminSession, AvailabilityInput, CommentInput, CreateSchedule, Join, MeetingInput, VoteInput
from . import service

app = FastAPI(title="合時 API", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security(request: Request, call_next):
    if request.method != "GET":
        origin = request.headers.get("origin")
        if origin != f"{urlparse(settings().app_url).scheme}://{urlparse(settings().app_url).netloc}":
            return JSONResponse({"error": "請由本站頁面操作。"}, 403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.exception_handler(RequestValidationError)
async def invalid(_request, exc):
    messages = []
    for issue in exc.errors():
        location = ".".join(str(v) for v in issue["loc"] if v != "body")
        messages.append(f"{location}: {issue['msg']}" if location else issue["msg"])
    return JSONResponse({"error": "；".join(messages)}, 400)


@app.exception_handler(StarletteHTTPException)
async def http_error(_request, exc):
    return JSONResponse({"error": exc.detail}, exc.status_code)


@app.exception_handler(Exception)
async def unexpected(_request, exc):
    return JSONResponse({"error": "操作暫時失敗，請稍後再試。"}, 500)


def tokens(request: Request, public_id: str):
    return request.cookies.get(cookie_name("admin", public_id)), request.cookies.get(cookie_name("participant", public_id))


def set_cookie(response: Response, kind: str, public_id: str, token: str):
    response.set_cookie(cookie_name(kind, public_id), token, max_age=31536000, httponly=True, secure=settings().cookie_secure, samesite="lax", path="/")


@app.get("/health")
def health(): return {"ok": True}


@app.post("/api/schedules", status_code=201)
def create_schedule(value: CreateSchedule, response: Response, db: Session = Depends(db_session)):
    public_id, admin_token, participant_token = service.create(db, value)
    set_cookie(response, "admin", public_id, admin_token); set_cookie(response, "participant", public_id, participant_token)
    return {"publicId": public_id, "adminLink": f"/s/{public_id}/manage#token={admin_token}"}


@app.get("/api/schedules/{public_id}")
def read_schedule(public_id: str, request: Request, db: Session = Depends(db_session)):
    a, p = tokens(request, public_id)
    return service.present(service.get_schedule(db, public_id), a, p)


@app.get("/api/schedules/{public_id}/calendar")
def calendar(public_id: str, db: Session = Depends(db_session)):
    schedule = service.get_schedule(db, public_id)
    if schedule.status.value != "CONFIRMED" or not schedule.meeting: service.fail("會議尚未確認或已取消。", 409)
    return Response(ics(schedule, schedule.meeting), media_type="text/calendar; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="meeting.ics"'})


@app.post("/api/schedules/{public_id}/admin-session")
def admin_session(public_id: str, value: AdminSession, response: Response, db: Session = Depends(db_session)):
    schedule = service.get_schedule(db, public_id)
    if not matches(value.token, schedule.admin_token_hash): service.fail("管理連結無效。", 403)
    set_cookie(response, "admin", public_id, value.token)
    return {"ok": True}


@app.post("/api/schedules/{public_id}/join")
def join(public_id: str, value: Join, request: Request, response: Response, db: Session = Depends(db_session)):
    _, current = tokens(request, public_id); token = service.join(db, public_id, value.name, current); set_cookie(response, "participant", public_id, token); return {"ok": True}


@app.put("/api/schedules/{public_id}/availability")
def availability(public_id: str, value: AvailabilityInput, request: Request, db: Session = Depends(db_session)):
    _, token=tokens(request, public_id); service.save_availability(db, public_id, value.slots, token); return {"ok": True}


@app.post("/api/schedules/{public_id}/vote")
def vote(public_id: str, value: VoteInput, request: Request, db: Session = Depends(db_session)):
    _, token=tokens(request, public_id); service.cast_vote(db, public_id, value.candidate_id, token); return {"ok": True}


@app.get("/api/schedules/{public_id}/notifications")
def notifications(public_id: str, request: Request, db: Session = Depends(db_session)):
    _, token = tokens(request, public_id)
    return {"notifications": service.list_notifications(db, public_id, token)}


@app.post("/api/schedules/{public_id}/notifications/read-all")
def read_all_notifications(public_id: str, request: Request, db: Session = Depends(db_session)):
    _, token = tokens(request, public_id)
    service.mark_all_notifications_read(db, public_id, token)
    return {"ok": True}


@app.post("/api/schedules/{public_id}/notifications/{notification_id}/read")
def read_notification(public_id: str, notification_id: str, request: Request, db: Session = Depends(db_session)):
    _, token = tokens(request, public_id)
    service.mark_notification_read(db, public_id, notification_id, token)
    return {"ok": True}


@app.post("/api/schedules/{public_id}/close-voting")
def close(public_id: str, request: Request, db: Session = Depends(db_session)):
    token, _=tokens(request, public_id); service.close_voting(db, public_id, token); return {"ok": True}


@app.post("/api/schedules/{public_id}/confirm")
def confirm(public_id: str, value: MeetingInput, request: Request, db: Session = Depends(db_session)):
    token, _=tokens(request, public_id); service.confirm(db, public_id, value, token); return {"ok": True}


@app.post("/api/schedules/{public_id}/cancel")
def cancel(public_id: str, request: Request, db: Session = Depends(db_session)):
    token, _=tokens(request, public_id); service.cancel(db, public_id, token); return {"ok": True}


@app.post("/api/schedules/{public_id}/comments")
def comment(public_id: str, value: CommentInput, request: Request, db: Session = Depends(db_session)):
    _, token=tokens(request, public_id); service.add_comment(db, public_id, value.content, token); return {"ok": True}


@app.delete("/api/schedules/{public_id}/comments/{comment_id}")
def remove_comment(public_id: str, comment_id: str, request: Request, db: Session = Depends(db_session)):
    a, p=tokens(request, public_id); service.delete_comment(db, public_id, comment_id, a, p); return {"ok": True}
