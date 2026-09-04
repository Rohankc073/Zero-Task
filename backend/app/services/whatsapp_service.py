import hmac
import hashlib
from typing import Optional, Dict, Any
import httpx
from app.core.config import settings
from app.core.logging import logger


class WhatsAppService:
    @staticmethod
    def verify_webhook_challenge(mode: str, token: str, challenge: str) -> Optional[str]:
        """Validates Meta WhatsApp Cloud API subscription verification challenge (optional/deferred)."""
        if not settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN:
            return None
        if mode == "subscribe" and token == settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN:
            return challenge
        return None

    @staticmethod
    def verify_signature(payload_bytes: bytes, signature_header: str) -> bool:
        """Verifies X-Hub-Signature-256 header using WHATSAPP_APP_SECRET if configured."""
        if not settings.WHATSAPP_APP_SECRET or not signature_header or not signature_header.startswith("sha256="):
            return False

        expected_sig = signature_header[7:]
        calculated_sig = hmac.new(
            settings.WHATSAPP_APP_SECRET.encode("utf-8"),
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected_sig, calculated_sig)

    @staticmethod
    async def send_text_message(recipient_phone: str, text: str) -> Dict[str, Any]:
        """Sends an outbound WhatsApp text message via Meta Graph API if enabled."""
        if not settings.ENABLE_WHATSAPP or not settings.WHATSAPP_ACCESS_TOKEN or not settings.WHATSAPP_PHONE_NUMBER_ID:
            return {"success": False, "error": "WhatsApp integration is optional and currently disabled"}

        url = f"https://graph.facebook.com/v20.0/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
        headers = {
            "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }
        body = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_phone,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=body, headers=headers)
                return {"success": resp.is_success, "response": resp.json()}
        except Exception as e:
            logger.error(f"WhatsApp dispatch failed: {e}")
            return {"success": False, "error": str(e)}


whatsapp_service = WhatsAppService()
