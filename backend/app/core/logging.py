import logging
import re
import sys
from app.core.config import settings

SENSITIVE_PATTERNS = [
    r'("?password"?\s*[:=]\s*")[^"]+(")',
    r'("?access_token"?\s*[:=]\s*")[^"]+(")',
    r'("?refresh_token"?\s*[:=]\s*")[^"]+(")',
    r'("?secret"?\s*[:=]\s*")[^"]+(")',
    r'("?authorization"?\s*[:=]\s*"(?:Bearer )?)[^"]+(")',
    r'(Bearer\s+)[A-Za-z0-9\-_\.]+',
]

COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in SENSITIVE_PATTERNS]


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        for pattern in COMPILED_PATTERNS:
            msg = pattern.sub(r'\1[REDACTED]\2' if r'\2' in pattern.pattern else r'\1[REDACTED]', msg)
        return msg


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("zerotask")
    logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
        formatter = RedactingFormatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] [%(filename)s:%(lineno)d] - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


logger = setup_logging()
