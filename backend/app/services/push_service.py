from typing import List, Dict, Any, Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from app.core.config import settings
from app.core.logging import logger
from app.models.user import UserPushToken

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class PushNotificationService:
    @staticmethod
    async def send_push_notification(
        tokens: List[str],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Dispatches push notifications via Expo push service and cleans up dead tokens."""
        if not settings.ENABLE_PUSH_NOTIFICATIONS or not tokens:
            return {"sent": 0, "errors": []}

        # Format Expo messages
        messages = [
            {
                "to": token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
            }
            for token in tokens
            if token and token.startswith("ExponentPushToken[")
        ]

        if not messages:
            return {"sent": 0, "errors": ["No valid ExponentPushTokens"]}

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if settings.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"

        dead_tokens = []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(EXPO_PUSH_URL, json=messages, headers=headers)
                res_data = response.json()

                if "data" in res_data and isinstance(res_data["data"], list):
                    for idx, receipt in enumerate(res_data["data"]):
                        if receipt.get("status") == "error":
                            details = receipt.get("details", {})
                            if details.get("error") == "DeviceNotRegistered":
                                dead_tokens.append(messages[idx]["to"])

            # Clean up dead tokens in database if session provided
            if dead_tokens and db:
                logger.info(f"Cleaning up {len(dead_tokens)} unregistered Expo push tokens")
                stmt = delete(UserPushToken).where(UserPushToken.token.in_(dead_tokens))
                await db.execute(stmt)
                await db.commit()

            return {"sent": len(messages), "dead_tokens_purged": len(dead_tokens)}

        except Exception as e:
            logger.error(f"Failed to send push notifications: {e}")
            return {"sent": 0, "errors": [str(e)]}


push_service = PushNotificationService()
