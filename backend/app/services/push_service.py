import os
import json
import time
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID
import httpx
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.config import settings
from app.core.logging import logger
from app.models.user import User, UserPushToken

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
FCM_OAUTH_URL = "https://oauth2.googleapis.com/token"

_fcm_access_token: Optional[str] = None
_fcm_token_expires_at: float = 0.0
_fcm_project_id: Optional[str] = None
_fcm_service_account: Optional[Dict[str, Any]] = None


def _load_firebase_service_account() -> Optional[Dict[str, Any]]:
    global _fcm_service_account, _fcm_project_id
    if _fcm_service_account:
        return _fcm_service_account

    candidate_paths = [
        os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH"),
        "/app/app/core/firebase-service-account.json",
        "/app/firebase-service-account.json",
        os.path.join(os.path.dirname(__file__), "..", "core", "firebase-service-account.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "firebase-service-account.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "firebase-service-account.json"),
        "firebase-service-account.json",
    ]

    for p in candidate_paths:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("type") == "service_account" and data.get("private_key"):
                        _fcm_service_account = data
                        _fcm_project_id = data.get("project_id")
                        logger.info(f"[Push/FCM] Loaded Firebase service account from '{p}' (project: {_fcm_project_id})")
                        return _fcm_service_account
            except Exception as e:
                logger.warning(f"[Push/FCM] Failed to parse service account at '{p}': {e}")

    logger.warning("[Push/FCM] No valid firebase-service-account.json found in candidate paths.")
    return None


async def _get_fcm_access_token() -> Tuple[Optional[str], Optional[str]]:
    """Generates and caches Google OAuth2 access token for Firebase Cloud Messaging v1."""
    global _fcm_access_token, _fcm_token_expires_at, _fcm_project_id
    now = time.time()
    if _fcm_access_token and now < _fcm_token_expires_at - 300:
        return _fcm_access_token, _fcm_project_id

    sa = _load_firebase_service_account()
    if not sa:
        return None, None

    try:
        now_int = int(now)
        jwt_claims = {
            "iss": sa["client_email"],
            "scope": "https://www.googleapis.com/auth/firebase.messaging",
            "aud": FCM_OAUTH_URL,
            "iat": now_int,
            "exp": now_int + 3600,
        }
        signed_jwt = jwt.encode(jwt_claims, sa["private_key"], algorithm="RS256")

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                FCM_OAUTH_URL,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": signed_jwt,
                },
            )
            if resp.status_code == 200:
                resp_json = resp.json()
                _fcm_access_token = resp_json.get("access_token")
                expires_in = resp_json.get("expires_in", 3600)
                _fcm_token_expires_at = now + expires_in
                _fcm_project_id = sa.get("project_id")
                return _fcm_access_token, _fcm_project_id
            else:
                logger.error(f"[Push/FCM] OAuth2 token exchange failed ({resp.status_code}): {resp.text}")
                return None, None
    except Exception as e:
        logger.error(f"[Push/FCM] Error obtaining FCM access token: {e}")
        return None, None


class PushNotificationService:
    @staticmethod
    def is_valid_expo_token(token: Optional[str]) -> bool:
        if not token or not isinstance(token, str):
            return False
        clean = token.strip()
        return clean.startswith("ExponentPushToken[") or clean.startswith("ExpoPushToken[")

    @staticmethod
    async def send_fcm_v1_notification(
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Dispatches push notifications directly to Google Firebase Cloud Messaging v1."""
        if not tokens:
            return {"sent": 0, "errors": []}

        access_token, project_id = await _get_fcm_access_token()
        if not access_token or not project_id:
            logger.warning("[Push/FCM] Skipping direct FCM dispatch: Missing access token or project ID")
            return {"sent": 0, "errors": ["FCM credentials not configured"]}

        fcm_url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        # Build clean string-only data map for FCM
        raw_data = data or {}
        string_data: Dict[str, str] = {
            "title": str(title),
            "body": str(body),
            "url": str(raw_data.get("action_url") or raw_data.get("url") or "/(drawer)/(tabs)/tasks"),
            "action_url": str(raw_data.get("action_url") or raw_data.get("url") or "/(drawer)/(tabs)/tasks"),
        }
        for k, v in raw_data.items():
            if v is not None:
                string_data[str(k)] = str(v)

        sent_count = 0
        dead_tokens = []
        errors = []

        async with httpx.AsyncClient(timeout=10.0) as client:
            for token in tokens:
                clean_token = token.strip()
                payload = {
                    "message": {
                        "token": clean_token,
                        "notification": {
                            "title": title,
                            "body": body,
                        },
                        "data": string_data,
                        "android": {
                            "priority": "HIGH",
                            "notification": {
                                "channel_id": "default",
                                "sound": "default",
                                "default_sound": True,
                                "default_vibrate_timings": True,
                                "notification_priority": "PRIORITY_MAX",
                                "visibility": "PUBLIC",
                            },
                        },
                    }
                }
                try:
                    resp = await client.post(fcm_url, json=payload, headers=headers)
                    masked = f"{clean_token[:12]}...{clean_token[-6:]}" if len(clean_token) > 20 else "***"
                    if resp.status_code == 200:
                        sent_count += 1
                        msg_name = resp.json().get("name", "")
                        logger.info(f"[Push/FCM] Direct FCM success for {masked}: {msg_name}")
                    else:
                        resp_text = resp.text
                        logger.warning(f"[Push/FCM] Direct FCM error ({resp.status_code}) for {masked}: {resp_text}")
                        errors.append(resp_text)
                        if "UNREGISTERED" in resp_text or "NOT_FOUND" in resp_text:
                            dead_tokens.append(clean_token)
                except Exception as req_err:
                    logger.error(f"[Push/FCM] Request failed for token: {req_err}")
                    errors.append(str(req_err))

        if dead_tokens and db:
            logger.info(f"[Push/FCM] Cleaning up {len(dead_tokens)} dead FCM token(s)")
            stmt = delete(UserPushToken).where(UserPushToken.token.in_(dead_tokens))
            await db.execute(stmt)
            await db.commit()

        return {
            "sent": sent_count,
            "dead_tokens_purged": len(dead_tokens),
            "errors": errors,
        }

    @staticmethod
    async def send_expo_push_notification(
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Dispatches push notifications via Expo push service and cleans up dead tokens."""
        if not tokens:
            return {"sent": 0, "errors": []}

        messages = [
            {
                "to": token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "channelId": "default",
                "priority": "high",
                "_displayInForeground": True,
            }
            for token in tokens
        ]

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if settings.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"

        dead_tokens = []
        sent_count = 0
        try:
            logger.info(f"[Push/Expo] Dispatching to {len(tokens)} Expo device(s) - Title: '{title}'")
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(EXPO_PUSH_URL, json=messages, headers=headers)
                res_data = response.json()
                logger.info(f"[Push/Expo] Expo API HTTP status {response.status_code}")

                if "data" in res_data and isinstance(res_data["data"], list):
                    for idx, receipt in enumerate(res_data["data"]):
                        ticket_status = receipt.get("status")
                        masked_token = f"{tokens[idx][:14]}...{tokens[idx][-6:]}" if len(tokens[idx]) > 20 else "***"
                        if ticket_status == "error":
                            details = receipt.get("details", {})
                            err_code = details.get("error")
                            err_msg = receipt.get("message", "Unknown error")
                            logger.warning(
                                f"[Push/Expo] Ticket error for {masked_token}: {err_msg} (error: {err_code})"
                            )
                            if err_code == "DeviceNotRegistered":
                                dead_tokens.append(messages[idx]["to"])
                        elif ticket_status == "ok":
                            sent_count += 1
                            ticket_id = receipt.get("id", "none")
                            logger.info(f"[Push/Expo] Ticket OK for {masked_token} (ticket_id: {ticket_id})")

            if dead_tokens and db:
                logger.info(f"[Push/Expo] Cleaning up {len(dead_tokens)} unregistered Expo push tokens")
                stmt = delete(UserPushToken).where(UserPushToken.token.in_(dead_tokens))
                await db.execute(stmt)
                await db.commit()

            return {
                "sent": len(messages),
                "dead_tokens_purged": len(dead_tokens),
                "expo_response": res_data,
            }
        except Exception as e:
            logger.error(f"[Push/Expo] Failed to send push notifications: {e}")
            return {"sent": 0, "errors": [str(e)]}

    @staticmethod
    async def send_push_notification(
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """
        Dual-Engine Push Notification Dispatcher:
        - Automatically routes native FCM tokens directly to Google Firebase Cloud Messaging v1.
        - Automatically routes ExponentPushTokens to the Expo Push Gateway.
        Ensures reliable real-device delivery across foreground, background, locked, and terminated states.
        """
        if not settings.ENABLE_PUSH_NOTIFICATIONS or not tokens:
            return {"sent": 0, "errors": []}

        expo_tokens = [t.strip() for t in tokens if PushNotificationService.is_valid_expo_token(t)]
        fcm_tokens = [t.strip() for t in tokens if not PushNotificationService.is_valid_expo_token(t) and len(t.strip()) > 20]

        total_sent = 0
        expo_res: Dict[str, Any] = {}
        fcm_res: Dict[str, Any] = {}

        if fcm_tokens:
            fcm_res = await PushNotificationService.send_fcm_v1_notification(
                tokens=fcm_tokens,
                title=title,
                body=body,
                data=data,
                db=db,
            )
            total_sent += fcm_res.get("sent", 0)

        if expo_tokens:
            expo_res = await PushNotificationService.send_expo_push_notification(
                tokens=expo_tokens,
                title=title,
                body=body,
                data=data,
                db=db,
            )
            total_sent += expo_res.get("sent", 0)

        total_dead = fcm_res.get("dead_tokens_purged", 0) + expo_res.get("dead_tokens_purged", 0)

        return {
            "sent": total_sent,
            "dead_tokens_purged": total_dead,
            "fcm_dispatch": fcm_res,
            "expo_dispatch": expo_res,
        }

    @staticmethod
    async def send_to_user(
        db: AsyncSession,
        user_id: UUID,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Fetches all registered device tokens for a user and dispatches push notification."""
        try:
            stmt = select(UserPushToken.token).where(UserPushToken.user_id == user_id)
            res = await db.execute(stmt)
            tokens = list(res.scalars().all())

            u_stmt = select(User.expo_push_token).where(User.id == user_id)
            u_res = await db.execute(u_stmt)
            single_token = u_res.scalar_one_or_none()
            if single_token and single_token not in tokens:
                tokens.append(single_token)

            if not tokens:
                return {"sent": 0, "message": "No registered push tokens for user"}

            return await PushNotificationService.send_push_notification(
                tokens=tokens,
                title=title,
                body=body,
                data=data,
                db=db,
            )
        except Exception as e:
            logger.error(f"Error dispatching push to user {user_id}: {e}")
            return {"sent": 0, "error": str(e)}

    @staticmethod
    async def send_to_users(
        db: AsyncSession,
        user_ids: List[UUID],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Dispatches push notifications to multiple users."""
        if not user_ids:
            return {"sent": 0}
        total_sent = 0
        for uid in set(user_ids):
            res = await PushNotificationService.send_to_user(db, uid, title, body, data)
            total_sent += res.get("sent", 0)
        return {"sent": total_sent}


push_service = PushNotificationService()
